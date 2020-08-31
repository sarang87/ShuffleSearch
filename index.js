'use strict';

//-------------------------------------------------------------------------
/**
 *  The server file for the Critisearch app, handles client interaction
 *  and provides functionality on the back-end that controllers alone 
 *  are insufficient for.
 *
 *  @authors Sarang Joshi
 *  @version v 1.1.0  (2019)
 */
//-------------------------------------------------------------------------

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http); // api docs: http://socket.io
var google = require('google'); // api docs: https://www.npmjs.com/package/google
// var async = require('async');  //probbaly shouldn't need this now with promises
var models = require('./models');
var _ = require('lodash');
var scholar = require('google-scholar');

var searchScholar = true
google.requestOptions = {
  timeout: 30000,
  gzip: true,
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en;q=0.5',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'DNT': 1
  }
}

let scholarResultsCallback = socket => {
  return response => {
    var processedResults = getProcessedScholarResults(response.results);
    console.log(JSON.stringify('processedResults' + processedResults));
    responsesForClient[socket.id].response = response;
    var incrementIndex = responsesForClient[socket.id].nextIndex;
    var arrayOfPromisesForEachCreatedResultInSequelize = processedResults.map(function(result, idx) {
      return {
        link: result.url,
        description: result.description,
        result_order: idx + incrementIndex,
        title: result.title,
        result_relevance: 'none',
        queryId: responsesForClient[socket.id].query.id,
        cited_count:result.citedCount,
        cited_url:result.citedUrl,
        related_url:result.relatedUrl,
        link_visited: false
      }
        
    });
    responsesForClient[socket.id].nextIndex +=processedResults.length
    Promise.all(arrayOfPromisesForEachCreatedResultInSequelize)
      .then(function(sequelizeResults) {
        socket.emit('search-results-scholar', sequelizeResults);
      })
       .catch(function (err){
        console.log('error')
        console.log(err)
       });
  };
};
 


// Limit the results per page for testing
google.resultsPerPage = 10;
// This dictionary holds the respone object for the search results for a client using the socket id
var responsesForClient= {};
/**
 * ~~ Initialization ~~
 * Steps required to start up the app and provide future functions with
 * variables they will use.
 */

  // here we will put any code that should wait for the db to be ready.

  // serve static files from the app directory, directly, without "app/" in URL
  app.use(express.static(__dirname + '/app'));

  const port = process.env.PORT || 3000;
  http.listen(port, function() {
    console.log('listening on *:', port);
  });






//-------------------------------------------------------------------------

// function for filtering Scholar Results. Do not know yet if it is required
function getProcessedScholarResults(results) {

  var resultsToSend = [];
  for (var i = 0; i < results.length; i++) {
    if (results[i].hasOwnProperty('url') && results[i].title.length > 0) {
      results[i].status = 0;
      resultsToSend.push(results[i]);
    }
  }
  console.log(resultsToSend)
  return resultsToSend;
}
  



// filters out google's enhanced results
function getProcessedResults(results) {

  var resultsToSend = [];
  for (var i = 0; i < results.length; i++) {
    if (results[i].hasOwnProperty('link') && results[i].title.length > 0) {
      results[i].status = 0;
      resultsToSend.push(results[i]);
    }

    var images = "Images for ";
    var news = "News for ";
    var maps = "Map for ";
    var youtube = "http://www.youtube.com/watch?v=";


    if (results[i].title.substr(0, images.length) == images || results[i].title.substr(0, news.length) == news || results[i].title.substr(0, maps.length) == maps) {
      console.log("Item removed: " + results[i].title);
      resultsToSend.pop();
    } else if (results[i].hasOwnProperty('link') && results[i].link != null) {
      if (results[i].link.substr(0, youtube.length) == youtube) {
        results[i].description = "Youtube link";
      }
    }
  }
  return resultsToSend;
}




function range(start, stop, step) {
  if (typeof stop == 'undefined') {
    // one param defined
    stop = start;
    start = 0;
  }

  if (typeof step == 'undefined') {
    step = 1;
  }

  if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
    return [];
  }

  var result = [];
  for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
    result.push(i);
  }

  return result;
};






/**
 * Get a random key. used by cookies
 * Packaged in a function for readability
 */
function getKey() {
  return Math.floor((Math.random() * 999999999) + 1);
}

/**
 * ~~ Activity ~~
 * The main functions of the server, listening for events on the client
 * side and responding appropriately.
 */
io.sockets.on('connection', function(socket) {
  let connectedAt = new Date();
  console.log('>> Client Connected  >> ', connectedAt);
  var connectionInfo = {};



  /**
   * Will catch when a client leaves the app interface entirely and send
   * out the updated number of connected students for the teacher view.
   */
  socket.on('disconnect', function() {
    console.log("socket.on('disconnect', function()");
    let disconnectedAt = new Date();
    console.log('<< Client with id', socket.id, 'Disconnected at time', disconnectedAt, '<<');
  });

  // When a user promotes a query an event is logged in the event table with the query details, client details and the query result which was voted up 
  socket.on('promoted', function(result) {
    console.log("socket.on('promoted', function(result)");
  });

  // When a user promotes a query an event is logged in the event table with the query details, client details and the query result which was voted down
  socket.on('demoted', function(result) {
    console.log("socket.on('demoted', function(result)");
  });

  socket.on('follow', function(result) {
    console.log("socket.on('follow', function(result)");
  });

  
  /**
   * When the user searchesfor more results. First identify the query and client from the socket id, then load more results
   */

  socket.on('load-more-results', function(data) {
    console.log("socket.on('load-more-results', function(data)");    
    console.log(responsesForClient)
    if (searchScholar) {
      if(responsesForClient &&
        responsesForClient.hasOwnProperty(socket.id) &&
        responsesForClient[socket.id].hasOwnProperty('response')&&
        responsesForClient[socket.id].response.next) {
      
        responsesForClient[socket.id].response.next()
          .then(scholarResultsCallback(socket));
      }
    } else {
      if(responsesForClient &&
        responsesForClient.hasOwnProperty(socket.id) &&
        responsesForClient[socket.id].hasOwnProperty('response')&&
        responsesForClient[socket.id].response.next) {    
        responsesForClient[socket.id].response.next();
      }
    }
  });
  

  const promise = new Promise(function(resolve, reject) {
  setTimeout(() => resolve(42), 1);
  });

  // When the user searches for the first time
  socket.on('q', function(details) {
      responsesForClient[socket.id] = {
        nextIndex: 0
      };
        
    var emptyPromise = promise.then(function(query) {
      responsesForClient[socket.id].query = query;
      if (searchScholar) {
        console.log('searching using scholar api...')
        scholar.search(details.query)
        .then(scholarResultsCallback(socket));
      }
    
    }).catch(function(err) {
      console.log(err);
    });
  });

  socket.on('critisort', function(uid) {
    console.log("socket.on('critisort', function(uid)");
    var details = 'user sorted the list';

  });
});
