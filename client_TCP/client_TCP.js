//================================================================
//#region Requirements

console.clear();
console.log('================================================================');
const net = require('net');
const WebSocket = require('ws');
const config = require('./config.json');

//#endregion

//================================================================
//#region WS relay connector

let isTunnelWorking = false;
let ws;

const ConnectTunnel = () => {
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
        //check if tunnel is working
        if(isTunnelWorking)
            //forward message to the TCP socket
            tcp.write(data);
        else{
            //log
            //console.log('Started tunneling');
            //enable direct messaging
            isTunnelWorking = true;
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
        ws.send(waitingDataToTransfer[i]);
    //clear data
    waitingDataToTransfer.length = 0;
};

const SendData = (data) => {
    if(isTunnelWorking)
        ws.send(data);
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
        SendData(data);
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