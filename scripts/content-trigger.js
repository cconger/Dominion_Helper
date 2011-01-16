/**
 * Embedded on every dominion.isotropic.org/play page.
 * Allows for triggering on game events.
 
 The point of this script is to:

  * Parse Log Lines
  * Turn them into commands
  * Push them

  Eventual goals:
    Allow overlays to give context based info instead of the single panel.
  
**/

var sel_log = "#game #log";
var sel_log_elems = "#game #log span"

var log_present = false;
var log_size    = 0;

var context;

//Throw Away Helper
function capFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

var translations = {
  "a" : 1,
  "an" : 1,
  "another" : 1,
};

var expression_handlers = {
  "Turn order is (.*) and then (\\w*)." : turn_order,
  "--- (.*) ---" : context_switch,
  "(\\w*) wins!" : game_end,
  "(\\w*) (buy|buys|gain|gains) (.*)" : gain_card,
  "gaining (.*)\." : gain_card,
  "(\\w*) (trash|trashes) (.*)\." : lose_card,
  "trashing (.*)\." : lose_card,
  "(You|\\w*) .*(get|gets).* \\+([0-9]) ▼" : gain_vp,
  "getting.*\\+([0-9]) ▼" : gain_vp,
  "(\\w*) (pass|passes|receive|receives) (.*) (to|from) (\\w*)\." : transfer_card,
};

function handle_update(){
  var new_log_size = $(sel_log_elems).size();
  var log_line = $(sel_log_elems).last().prev().text().trim();
  if(!log_line || log_size >= new_log_size) { return; }
  log_size = new_log_size;
  //console.log(log_line);
  
  var re;
  var matches
  for (expression in expression_handlers) {
    re = new RegExp(expression);
    matches = log_line.match(re);
    if(matches){
      expression_handlers[expression](matches)
    }
  }
}

/* HANDLERS */

function turn_order(matches) {
  chrome.extension.sendRequest({'command' : 'reset_game'},
                               function(response) {});
  var players = matches[1].split(", ");
  players.push(matches[2]);
  //NOTE THIS IS ONLY CALLED IN MULTIPLAYER GAMES
  chrome.extension.sendRequest({'command' : 'add_players',
                                'players'  : players.map(capFirstLetter)},
                                function(response) {});
}

function context_switch(matches) {
  context = matches[1].split(' ')[0];
  if(context == "Your") { context = "You"; }
  if(context.substring(context.length-2) == "'s") {
    context = context.substring(0,context.length -2);
  }
}

function game_end(matches) {
  chrome.extension.sendRequest({'command' : 'game_end',
                                'winner'  : matches[1]},
                                function(response) {});
}

function gain_card(matches) {
  var card_sequence, player;
  var filter = /(a|an|another|[0-9]+) ([\w ]+)/
  if(matches.length > 2){
    card_sequence = matches[3].match(filter);
    player = matches[1];
  } else {
    card_sequence = matches[1].match(filter);
    player = context;
  }
  
  if(card_sequence){
    var num = translations[card_sequence[1]] || card_sequence[1];
    chrome.extension.sendRequest({'command' : 'gain_card',
                                  'player'  : player,
                                  'quantity': num,
                                  'card'    : card_sequence[2]},
                                  function(response) {});
  }
}

function lose_card(matches) {
  var sequence, player;
  var filter = /(a|an|[0-9]+) ([\w ]+)/
  
  function splitter(string) {
    if(string.indexOf(",") != -1){
      return ", ";
    }
    return " and ";
  }
  
  if(matches.length > 2){
    sequence = matches[3].split(splitter(matches[3]));
    player = matches[1];
  } else {
    sequence = matches[1].split(splitter(matches[1]));
    player = context;
  }

  for(item in sequence) {
    match = sequence[item].match(filter);
    if(match){
      card_name = match[2];
      num = translations[match[1]] || match[1];
      chrome.extension.sendRequest({'command' : 'lose_card',
                                    'player'  : player,
                                    'quantity': num,
                                    'card'    : card_name},
                                    function(response) {});
    }
  }
  /*TODO(Channing): Compound to a single Request!
  while(sequence.length > 0 && filter.test(sequence.join(' '))){
    match = sequence.join(' ').match(filter);
    card_name = match[2];
    num = translations[match[1]] || match[1];
    chrome.extension.sendRequest({'command' : 'lose_card',
                                  'player'  : player,
                                  'quantity': num,
                                  'card'    : card_name},
                                  function(response) {});
    sequence = sequence.slice(sequence.indexOf(card_name.split().pop())+1);
  }*/
}

function gain_vp(matches) {
  var player, quantity;
  if(matches.size > 2){
    player = matches[1];
    quantity = matches[3];
  } else {
    player = context;
    quantity = matches[1];
  }
  chrome.extension.sendRequest({'command' : 'gain_vp',
                                'player'  : player,
                                'quantity': quantity},
                                function(response) {});
}

//"(\\w*) (pass|passes|receive|receives) (.*) to|from (\\w*)."
function transfer_card(matches) {
  var target, source, what;
  if(matches[4] == "from"){
    target = matches[1];
    source = matches[5];
    what = matches[3];
  } else {
    target = matches[5];
    source = matches[1];
    what = matches[3];
  }
  card = what.split(' ').slice(1).join(' ');
  chrome.extension.sendRequest({'command' : 'gain_card',
                                'player'  : target,
                                'quantity': 1,
                                'card'    : card},
                                function(response) {});

  chrome.extension.sendRequest({'command' : 'lose_card',
                                'player'  : source,
                                'quantity': 1,
                                'card'    : card},
                                function(response) {});
}

function register_log(){
  if(!log_present && $(sel_log).size() > 0){
    $(sel_log).bind("DOMNodeInserted", handle_update);
    log_present = true;
    chrome.extension.sendRequest({'command' : 'reset_game'},
                                 function(response) {});
    log_size    = 0;
  } else if ($(sel_log).size() == 0) {
    log_present = false;
  }
}

document.addEventListener("DOMSubtreeModified", register_log)