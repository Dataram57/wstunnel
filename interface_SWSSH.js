//================================================================
//#region Requirements

const config = require('./config_SWSSH.json');
const { Client } = require('ssh2');
const CryptoProfile = require('./lib_crypto.js');

//#endregion

//================================================================
//#region Encryption & Decryption

//prepare superSecretKey
config.superSecretKey = Buffer.from(config.superSecretKey, 'hex');

//prepare profiles
const cryptoServer = new CryptoProfile(config.superSecretKey);
const cryptoClient = new CryptoProfile(config.superSecretKey);

//#endregion

//================================================================
//#region Init

const applicationType = "SWSSH";
let OriginalSend = function(){};
let Close = function(){};
const Init = (func_message, func_close) => {
    OriginalSend = func_message;
    Close = func_close;
};

const Send = message => {
    //Encryption here
    message = cryptoServer.Encrypt(message);
    //next key
    cryptoServer.NextKey();
    //send
    OriginalSend(message);
};

//#endregion

//================================================================
//#region Functions

const StringBackspace = txt => txt.substring(0, txt.length - 1);

const onStart = () => {
    //reset crypto profiles
    cryptoServer.SetToBase();
    cryptoClient.SetToBase();
    //wait for seed
    state = -1;
    //generate seed
    const seed = cryptoServer.GenerateRandomSeed(config.seedMinSize, config.seedMaxSize);
    //send seed
    Send(seed);
    //use seed next time
    cryptoServer.SetSeed(seed);
};

const Intro = () => {
    if(state != 1){
        state = 1;
        username = '';
        password = '';
        Send("\n\rInput username: ");
    }
}; 

//temp vars
let i = 0;
let f = 0;
let key = 0;
let temp = '';

const onMessage = (message) => {
    //decrypt message
    message = cryptoClient.Decrypt(message);
    //calc next key
    cryptoClient.NextKey();
    //login and password input
    if(state == 1 || state == 2){
        //scan through each character
        f = message.length;
        i = -1;
        temp = '';
        while(++i < f){
            //get key
            key = message[i];
            //check if special key
            if(key == 13){
                //enter (carriage return)
                //next state
                if(state == 1){
                    temp += "\n\rInput password: ";
                    state = 2;
                }
                else{
                    //connect
                    temp += "\n\rConnecting to the SSH server...";
                    state = 0;
                    ReconnectSSH();
                }
            }
            else if(key == 127){
                //but only if possible
                if(((state == 1) ? username.length : password.length) > 0){
                    //Send cut data
                    temp = StringBackspace(temp);
                    Send(temp);
                    Send("\b\x1B[K\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00");
                    //clean current data
                    temp = '';
                    //change input
                    if(state == 1)
                        username = StringBackspace(username);
                    else
                        password = StringBackspace(password);
                }
            }
            else{
                //add key
                if(state == 1){
                    temp += String.fromCharCode(key);
                    username += message;
                }
                else{
                    temp += '*';
                    password += message;
                }
            }

        }
        //send input back
        Send(temp);
    }
    else if(state == -1){
        //apply client seed
        cryptoClient.SetSeed(message);
        //Start application
        Intro();
    }
    else if(ssh){
        if(sshStream){
            sshStream.write(message);
        }
    }
};

const onEnd = () => {
    state = -1;
};

module.exports = {applicationType, Init, onStart, onMessage, onEnd};

//#endregion

//================================================================
//#region SSH client

let state = -1;
//-1 - waiting for seed(used for encryption)
//0 - none / waiting
//1 - input username
//2 - input password
let username = '';
let password = '';
let ssh = null;
let sshStream = null;

const CloseSSH = () => {
    if(ssh){
        ssh.end();
        ssh.destroy();
        ssh = null;
    }
    if(sshStream){
        sshStream = null;
    }
    Intro();
};

const ReconnectSSH = () => {
    ssh = new Client();
    //setup events

    ssh.on('ready', () => {
        ssh.shell((err, stream) => {
            //error
            if (err){
                console.log(err);
                CloseSSH();
                return;
            }
            //apply stream
            sshStream = stream;
            SetupSSHstream();
        });
    });

    ssh.on('error', (err) => {
        //console.error('SSH connection error:', err);
        Send("\n\rError: " + err.name + "\n\rLevel: " + err.level + "\n\rDescription: " + err.description);
        CloseSSH();
    });
      
    ssh.on('end', () => {
        CloseSSH();
    });

    //connect
    ssh.connect({
        host: config.host
        ,port: config.port
        ,username: username
        ,password: password
    });
};

const SetupSSHstream = () => {
    sshStream.on('close', () => {
        CloseSSH();
    });

    sshStream.on('data', (data) => {
        Send(data);
    });

    sshStream.on('error', (err) => {
        console.error('SSH stream error:', err);
        CloseSSH();
    });
};

//#endregion