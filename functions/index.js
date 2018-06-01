const functions = require('firebase-functions');
const admin = require('firebase-admin');
const learningHelper = require('./learningHelper');


exports.functionGroup = {
    onLearningProcessTriggered : learningHelper.onLearningTriggered,
    onIncreasePotentialWeightTriggered : learningHelper.onIncreasePotentialWeightTriggered

};


admin.initializeApp(functions.config().firebase);