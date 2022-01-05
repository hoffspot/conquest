/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström 
    
    http://underscorediscovery.com
    
    MIT Licensed. See LICENSE for full license.
    Usage : node simplest.app.js
*/

var 
gameport        = process.env.PORT || 4004,

wrtc            = require('wrtc'),
SimplePeer      = require('simple-peer'),
UUID            = require('node-uuid'),
verbose         = false,
express         = require('express'),
app             = express(),
http            = require('http'),
server          = http.createServer(app), 
io              = require('socket.io')(server);

/* Express server set up. */

//The express server handles passing our content to the browser,
//As well as routing users where they need to go. This example is bare bones
//and will serve any file the user requests from the root of your web server (where you launch the script from)
//so keep this in mind - this is not a production script but a development teaching tool.

//Tell the server to listen for incoming connections
server.listen( gameport );

//Log something so we know that it succeeded.
console.log('\t :: Express :: Listening on port ' + gameport );

const p = new SimplePeer({
    initiator: false,
    trickle: false,
    wrtc: wrtc
})

//Catch all exceptions
process.on('uncaughtException', err => {
    console.error('There was an uncaught error', err)
    process.exit(1) //mandatory (as per the Node.js docs)
})

//By default, we forward the / path to index.html automatically.
app.get( '/', function( req, res ){ 
    res.sendFile( __dirname + '/index.html' );
});

//This handler will listen for requests on /*, any file from the root of our server.
//See expressjs documentation for more info on routing.

app.get( '/*' , function( req, res, next ) {

    //This is the current file they have requested
    var file = req.params[0]; 

    //For debugging, we can track what files are requested.
    if(verbose) console.log('\t :: Express :: file requested : ' + file);

    //Send the requesting client the file.
    res.sendFile( __dirname + '/' + file );

}); //app.get *

/* Socket.IO server set up. */

//Express and socket.io can work together to serve the socket.io client files for you.
//This way, when the client requests '/socket.io/' files, socket.io determines what the client needs.
        
        //Create a socket.io instance using our express server
        //TH - Adjusted to html listner from const

        //Configure the socket.io connection settings. 
        //See http://socket.io/
    /*io.configure(function (){

        io.set('log level', 0);

        io.set('authorization', function (handshakeData, callback) {
          callback(null, true); // error first callback style 
        });

    });*/

        //Socket.io will call this function when a client connects, 
        //So we can send that client a unique ID we use so we can 
        //maintain the list of players.
    io.on('connection', function (client) {
        
            //Generate a new UUID, looks something like 
            //5b2ca132-64bd-4513-99da-90e838ca47d1
            //and store this on their socket/connection
        client.userid = UUID();

            //tell the player they connected, giving them their id
        client.emit('onconnected', { id: client.userid } );

            //Useful to know when someone connects
        console.log('\t socket.io:: player ' + client.userid + ' connected');
        
        //Process WebRTC Peer request received from client
        client.on('WebRTCSignal', (arg) => {
            console.log(arg); //Should be RTC Offer
            p.signal(JSON.parse(arg));
          });
        
        p.on('connect', () => {
            console.log('CONNECTED.  SENDING Test Data');
            p.send('Test Data: ' + Math.random())
        });

        p.on('signal', data => {
            console.log('Server SIGNAL', JSON.stringify(data));
            //Now negotiate initiator signal with Web RTC Peer at server by sending the ICE request as JSON
            client.emit('WebRTCSignal', JSON.stringify(data));
        });

        p.on('data', data => {
            console.log('ON DATA event received')
            console.log('data: ' + data)
          })

        //When this client disconnects
        client.on('disconnect', function () {

                //Useful to know when someone disconnects
            console.log('\t socket.io:: client disconnected ' + client.userid );

        }); //client.on disconnect
     
    }); //io.sockets.on connection