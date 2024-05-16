//================================================================
//#region Requirements

console.clear();
console.log('================================================================');
const config = require('./config.json');
const net = require('net');
const WebSocket = require('ws');
const CryptoProfile = require('./lib_crypto.js');

//#endregion

//================================================================
//#region Encryption & Decryption

//prepare superSecretKey
config.superSecretKey = Buffer.from(config.superSecretKey, 'hex');

//prepare profiles
const cryptoServer = new CryptoProfile(config.superSecretKey);
const cryptoClient = new CryptoProfile(config.superSecretKey);

//Scheme:
//1. Server sends seed (client is waiting for this seed)
//2. Client uses this seed, and sends his (server is waiting for this seed (not required for client to wait for))
//3. Server and Client can now start a conversation

//#endregion

//================================================================
//#region WS relay connector

let isTunnelWorking = false;
let ws;

const ConnectTunnel = () => {
    //reset crypto profiles
    cryptoServer.SetToBase();
    cryptoClient.SetToBase();

    //Connect to the tunnel
    isTunnelWorking = false;
    ws = new WebSocket(config.wsaddress);
    
    //setup events
    ws.on('open', () => {
        //log
        //console.log('Tunnel Locked.');
    });
    
    // Event listener for incoming messages from the server
    ws.on('message', (data) => {
        //decrypt message
        data = cryptoServer.Decrypt(data);
        //calc next key
        cryptoServer.NextKey();
        //check if tunnel is working
        if(isTunnelWorking)
            //forward message to the TCP socket
            tcp.write(data);
        else{
            //log
            //console.log('Started tunneling');
            //enable direct messaging
            isTunnelWorking = true;
            
            //apply seed
            cryptoServer.SetSeed(data);
            //send client seed
            const seed = cryptoClient.GenerateRandomSeed(config.seedMinSize, config.seedMaxSize);
            Send(seed);     //encrypted with the base
            cryptoClient.SetSeed(seed);

            //bump waiting data
            BumpWaitingData();
        }
    });
    
    // Event listener for WebSocket connection closure
    ws.on('close', () => {
        //close tcp
        CloseTunnel();
    });

    // Event listener for WebSocket connection errors
    ws.on('error', (error) => {
        //destroy tcp and ws
        console.log('WebSocket error:', error);
        CloseTunnel();
    });
};

const CloseTunnel = () => {
    //mark tunnel as closed(ready for a next connection)
    isTunnelWorking = false;
    //close ws
    if(ws){
        ws.close();
        ws = null;
    }
    //close tcp socket
    if(tcp){
        tcp.destroy();
        tcp = null;
    }

    //log
    //console.log('Tunnel Unlocked.');
};

//#endregion

//================================================================
//#region Data Transmitter

const waitingDataToTransfer = [];

const BumpWaitingData = () => {
    //bump data
    for(let i = 0; i < waitingDataToTransfer.length; i++)
        Send(waitingDataToTransfer[i]);
    //clear data
    waitingDataToTransfer.length = 0;
};

const Send = (data) => {
    if(isTunnelWorking){
        //encrypt and send and next key
        ws.send(cryptoClient.Encrypt(data));
        cryptoClient.NextKey();
    }
    else
        waitingDataToTransfer.push(data);
};

//#endregion

//================================================================
//#region TCP local server

let tcp;

const server = net.createServer(socket => {
    //block any new connections if 1 has already been done
    if(tcp){
        socket.destroy();
        return;
    }

    //make this connection primary
    tcp = socket;

    // Event listener for incoming data from clients
    tcp.on('data', data => {
        //forward message to the tunnel
        Send(data);
    });

    // Event listener for client disconnection
    tcp.on('end', () => {
        //close this socket and tunnel too
        CloseTunnel();
    });

    //Connect to tunnel
    ConnectTunnel();
});

// Start the server and listen on a specific port
server.listen(config.port, config.host, () => {
    console.log(`TCP tunnel client started on ${config.host}:${config.port}`);
});

//#endregion