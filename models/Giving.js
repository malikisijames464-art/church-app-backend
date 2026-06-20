const mongoose = require('mongoose');

const givingSchema = new mongoose.Schema({

category:{
type:String,
required:true,
unique:true
},

mtnNumber:String,

airtelNumber:String,

accountName:String,

accountNumber:String

},
{
timestamps:true
});

module.exports = mongoose.model(
'Giving',
givingSchema
);