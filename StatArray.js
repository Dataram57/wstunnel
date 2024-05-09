module.exports = class {
    constructor(length){
        this.data = [];
        this.sum = 0;
        this.index = 0; //index of the next element to replace
        this.leftLength = length;
        while(length-- > 0)
            this.data.push(NaN);
    }

    Reset(){
        this.sum = 0;
        this.index = 0;
        this.leftLength = this.data.length;
        let i = this.leftLength;
        while(i-- > 0)
            this.data[i] = NaN;
    }

    Register(value){
        if(this.leftLength > 0){
            //There are NaNs in the array
            this.sum += value;
            this.data[this.index] = value;
            this.leftLength--;
        }
        else{
            //data needs to be replaced
            this.sum += (value - this.data[this.index]);
            this.data[this.index] = value;
        }
        //next index
        if(++this.index >= this.data.length)
            this.index = 0;
    }

    GetAvarage(){
        if(this.leftLength > 0)
            if(this.index == 0)
                return NaN;
            else
                return this.sum / this.index;
        return this.sum / this.data.length;
    }

    GetRecent(){
        return this.data[this.index - 1];
    }
}