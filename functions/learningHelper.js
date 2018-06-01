
/**
 * Created by matka on 21/05/2018.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

//var ssmMock = require('./mock');
var _ = require('lodash');
var SIMILARITY_BAR_PREDEFINED = 0.8
var SIMILARITY_BAR_PENDING = 0.9
var SIMILAR_RELATED_QUESTIONS_BAR = 3

exports.onLearningTriggered = functions
    .database
    .ref("learnPerUser/{userId}/{learningObjId}")
    .onCreate(function (obj, context) {
        console.log(Object.keys(obj))
        console.log(obj._data)
        console.log(JSON.stringify(obj._data))
        console.log(obj.data)
        console.log(obj)
        const learningDetails = obj._data

        console.log("New learning question was added to learnPerUser - isShouldLearn trigger ")
        //console.log(JSON.stringify(learningDetails))
        console.log(learningDetails)
        console.log("Context obj is: ")
        console.log(JSON.stringify(context))

        //1. get all pre defined sentence per intent + entity (all those with weight = 1)
        console.log("$$$$$$$$$$$$$$The userId before calling the function here is: " )
        //console.log(learningDetails.userId)
        console.log(context.params.userId)

        fetchExistingPhrases(learningDetails).then(function (questionsPerUser) {
            // get all potential questions we need to go over
            // 2. fetch potential questions from user
            console.log("returned from fetchExistingPhrases")

            // turn the snapshot into an array and continue working with arr from now
            var phrases = extractValues(questionsPerUser)
            console.log('Got phrases:')
            console.log(phrases)

            console.log("entering fetchPotentialQuePerUser ")
            fetchPotentialQuePerUser(learningDetails).then(function (potentialQuestions) {


                console.log('returned from potential questions:' + JSON.stringify(potentialQuestions))
                //console.log(potentialQuestions)
                // 3. loop through sentences and send to SSM - compare new format to each of
                // existing sentences with weight of 1

                // debug data validation
                console.log('Still Got phrases:')
                console.log(phrases)


                // create an array of those with weight 1
                var phraseswWithWeight1 = phrases.filter(function (phrase) {
                    return phrase.weight === 1
                })

                console.log('phraseswWithWeight1')
                console.log(phraseswWithWeight1)

                var phraseswWithWeightLowerThan1 = phrases.filter(function (phrase) {
                    return phrase.weight < 1
                })

                console.log('phraseswWithWeightLowerThan1')
                console.log(phraseswWithWeightLowerThan1)

                // the entity on which we will categorize the learned questions
                var entity = null

                // var maxMatch = 0.0
                // replace potentilQuestions with an array of questions + similairty score for each question
                potentialQuestions = potentialQuestions.map(function (potential) {
                    // populate entity from learningQuestionsPerUser
                    if (potential.entity && potential.entity !== "general") {
                        entity = potential.entity
                    }

                    // compare currebt potential question tp all existing with weight 1 and
                    //return maximal match
                    var maxMatchPotentialToExisting = phraseswWithWeight1.reduce(function (acc, phrase) {
                        // send both to compare similarity
                        //var similarityScore = ssmMock.mockSSMResponse()
                        var similarityScore = 0.7
                        if (similarityScore > acc) {
                            acc = similarityScore
                        }
                        return acc

                    }, 0.0)

                    potential.weight = maxMatchPotentialToExisting
                    return potential

                })

                console.log('potentialQuestions AFTER text comparison')
                console.log(potentialQuestions)

                potentialQuestions = potentialQuestions.filter(function (potential) {
                    // filter out only those with similarity score higher than similarity bar
                    return potential.weight >= SIMILARITY_BAR_PREDEFINED
                })

                console.log('potentialQuestions AFTER filter SIMILARITY_BAR_PREDEFINED')
                console.log(potentialQuestions)

                // save potential to DB here
                // create a promise obj for each potential question, save them using Promise.all
                //wait for the result of ALL of them
                var promises = potentialQuestions.map(function (potential) {
                    return savePotentialQuestionToLearningGraph(potential, entity)
                })
                console.log('create promises to save "new" Q')
                console.log(promises)

                Promise.all(promises).then(function (values) {
                    console.log("Saved all potential q to graph  ")
                    console.log(JSON.stringify(values))


                    // We work on ADDED questions with weight lower than 1

                    var combinedPhrases = phraseswWithWeightLowerThan1.concat(potentialQuestions)

                    combinedPhrases.forEach(function (phrase, index) {
                        combinedPhrases.forEach(function (other, otherIndex) {
                            if (index != otherIndex) {
                                // send both to compare similarity , send (phrase vs other)
                                //var pendingSimilarityScore = ssmMock.mockSSMResponse()
                                var pendingSimilarityScore = 0.93
                                if (pendingSimilarityScore > SIMILARITY_BAR_PENDING) {
                                    increasePotentialWeight(phrase, other)
                                    // saving the other to the current phrase in DB,
                                    // actually increasing the odds to be added to nlp engine
                                }

                            }
                        })
                    })

                })

                var dataToDelete = {
                    learningObjId: context.learningObjId,
                    intent: learningDetails.intent,
                    entity: learningDetails.entity,
                    userId: learningDetails.userId
                }

                console.log('create dataToDelete:')
                console.log(JSON.stringify(dataToDelete))

                return deleteSavedPotentialQuestions(dataToDelete).then(function (res) {
                    console.log("Deleted learning_questions and learnPerUser ")
                    console.log(JSON.stringify(res))
                })
            })
                .catch(function (error) {

                })

        })

    })



function deleteSavedPotentialQuestions(data){

   var learningQuestionsPath = "learnPerUser/" + data.userId + "/" + data.learningObjId
    var learningQuestionRef =
        admin
        .database()
        .ref(learningQuestionsPath)

    // promises array to handle ALL deletions
    // learningQuestionRef is to delete learnPerUser questions
    var promises = [learningQuestionRef.remove()]


    var potentialQuestionsTreePath = "learning_questions/"+ data.userId + "/" +
        data.intent + "/" + data.entity



    var learningPotentialRef = admin
        .database()
        .ref(potentialQuestionsTreePath)

    // push another promise to prmises array, this time  to delete learning_questions per entity
    promises.push(learningPotentialRef.remove())

    return Promise.all(promises).then(function (values) {

        return Promise.resolve(values)

    }).catch(function(error){
        console.log("Error from delete questions")
        console.log(error)
        return Promise.reject(error)
    })
}

function savePotentialQuestionToLearningGraph(potentialQuestion, entity){
    var path = "learning_graph/"+
        potentialQuestion.intent + "/" + entity


    var learningRef = admin
        .database()
        .ref(path)
        .child(potentialQuestion.questionKey)


    potentialQuestion.creationDate = (new Date()).toString()

    return learningRef.update(potentialQuestion).then(function(res){

        // how to return result from promise
        console.log("Object added to learning graph ")
        console.log(JSON.stringify(res))
        return Promise.resolve(res)

    }).catch(function (err) {
        return Promise.reject(err)
    })
}

function fetchPotentialQuePerUser(learningDetails){

    console.log("The data in fetchPotentialQuePerUser is : " + JSON.stringify(learningDetails))
    console.log("The userId here is: " + learningDetails.userId)

    var path = "learning_questions/"+ learningDetails.userId + "/" + learningDetails.intent
    console.log("The path for learning_questions " + path)
    return admin.database().ref(path).once('value').then(function(snapshot) {
        var questionsPerUser = snapshot.val() || null
        if(questionsPerUser){

            console.log(" ########################## potential questionsPerUser RETURNED FROM FIREBASE  ###########################")
            console.log(" the result from firebase is: " + JSON.stringify(questionsPerUser))


            var data = questionsPerUser//_.get(questionsPerUser,learningDetails.intent,{})
            var entity = _.get(data,learningDetails.entity,null)
            console.log(JSON.stringify(entity))
            var general = _.get(data,"general",null)
            console.log(JSON.stringify(general))


            var result = extractValues(entity).concat(extractValues(general))


            return Promise.resolve(result)
        }
        return Promise.resolve([])
    }).catch(function (err) {
        return Promise.reject(err)
    })
}

function fetchExistingPhrases(learningDetails) {
    console.log("The data in getExistingPhrases is : " + JSON.stringify(learningDetails))
    var path = "learning_graph/" + learningDetails.intent + "/" + learningDetails.entity
    console.log(path)
    return admin.database().ref(path).once('value', function (snapshot) {

        console.log("Snapshot retruned: ");
        var snapShotvar = snapshot.val()
        console.log(snapShotvar)
        //console.log(snapshot.val());
        var questionsPerUser = snapShotvar || null

        if(questionsPerUser) {
            //var result2 = extractValues(questionsPerUser)

            console.log("this is result from fetchExistingPhrases:")

            console.log(questionsPerUser)
            return Promise.resolve(questionsPerUser)
        }
        return Promise.resolve([])

    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
        return Promise.reject(errorObject)

    })
}

     /*
    //return admin.database().ref(path).once("value").then(function(snapshot) {
        var existingPhrases = snapshot.val() || null
        console.log("What we get from snapshot: ")
        console.log(JSON.stringify(snapshot.val()))
        if(existingPhrases){
            console.log(" ##########################  existingPhrases RETURNED FROM FIREBASE  ###########################")
            console.log(" the result from firebase is: " + JSON.stringify(existingPhrases))
            var entity = _.get(existingPhrases,learningDetails.entity,null)
            var general = _.get(existingPhrases,"general",null)
            var result = extractValues(entity).concat(extractValues(general))
            return Promise.resolve(result)

        }
        return Promise.resolve([])



    }).catch(function (err) {
        return Promise.reject(err)
    })
}*/

function increasePotentialWeight(potential, other) {

   var path = "learning_graph/{intent}/{entity}/{potentialQuestionId}/similarQuestions"

    var potentialQuestionRef = admin
        .database()
        .ref(path)
        //adding other to potential using other's key
        .child(other.questionKey)
    //create NEW INSTANCE of "other" and overrwrite similar questions field
    var data = Object.assign({},other,{similarQuestions: null})


    return  potentialQuestionRef.update(data).then(function(res){
        console.log("updated similarQuestions with another question")
        console.log(JSON.stringify(res))
        return Promise.resolve(res)
    }).catch(function(error){
        console.log("received an error from increasePotentialWeight:")
        console.log(error)
    })


}


//////////////////////////////////////////////////////////////////////////


exports.onIncreasePotentialWeightTriggered = functions
    .database
    .ref("learning_graph/{intent}/{entity}/{potentialQuestionId}")
    .onUpdate(function (potentialQuestion,context) {
        console.log("The next questions was updated:")
        console.log(JSON.stringify(potentialQuestion))

        console.log("Context obj is: ")
        console.log(JSON.stringify(context))

        // due to async logic, we are checking if the weight is not 1 and if not we consider adding it,
        // if it is 1, it means its already added to wit
        if(potentialQuestion.weight !== 1){
            var similarQuestionsCount = Object.keys(potentialQuestion.similarQuestions)
            if(similarQuestionsCount >= SIMILAR_RELATED_QUESTIONS_BAR ){
                // CHANGE TO WEIGHT 1

                var data = {
                    intent: potentialQuestion.intent,
                    entity: potentialQuestion.entity,
                    potentialQuestionId: context.potentialQuestionId
                }
                changeWeightTo1(data).then(function (res) {
                    // ADD TO WIT.AI

                })

            }
        }


    })



//////////////////////////////////////////////////////////////////////////


function changeWeightTo1(data) {
    var path  = "learning_graph/ " + data.intent +"/" + data.entity + "/" + data.potentialQuestionId

    var potentialQuestionRef = admin
        .database()
        .ref(path)

   return potentialQuestionRef.set({weight:1}).then(function (res) {
        console.log("Question weight was changed to 1 :")
        console.log(JSON.stringify(res))
        return Promise.resolve(res)
    }).catch(function (error) {
       console.log("error returning from update to weight 1")
       console.log(error)
       return Promise.reject(error)
   })
}


function extractValues(data){
    if(data){
        var keys = Object.keys(data)
        return keys.map(function(key){
            return data[key]
        })
    }
    return []
}




function addQuestionToNLP(data) {
    // we call this fucntion after we increa
}