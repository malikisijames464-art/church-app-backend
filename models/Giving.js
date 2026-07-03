const mongoose = require("mongoose");

const givingSchema = new mongoose.Schema(
{
    category:{
        type:String,
        required:true,
        unique:true,
        enum:[
            "Tithes",
            "Offerings",
            "Building Project",
            "Outreach",
            "Special Seed"
        ]
    },

    mtnNumber:{
        type:String,
        default:""
    },

    airtelNumber:{
        type:String,
        default:""
    },

    bankName:{
        type:String,
        default:""
    },

    accountName:{
        type:String,
        default:""
    },

    accountNumber:{
        type:String,
        default:""
    }
},
{
    timestamps:true
});

module.exports = mongoose.model("Giving", givingSchema);