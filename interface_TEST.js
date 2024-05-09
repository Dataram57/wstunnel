//================================================================
//#region Init

const applicationType = "TEST"
let Send = function(){};
let Close = function(){};
const Init = (func_message, func_close) => {
    Send = func_message;
    Close = func_close;
};

//#endregion

//================================================================
//#region Functions

const onStart = () => {
    Send('Hello World!!!');
};

const onMessage = (message) => {
    Send(message);
};

const onEnd = () => {

};

module.exports = {applicationType, Init, onStart, onMessage, onEnd};

//#endregion