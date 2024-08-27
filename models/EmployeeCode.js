const { Schema, model } = require('mongoose');

const employeeCodeSchema = new Schema(
    {}, 
    {
    strict: false
    }
);

module.exports = model('EmployeeCode', employeeCodeSchema);