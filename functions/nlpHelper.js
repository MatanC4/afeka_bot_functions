

/*curl -XPOST 'https://api.wit.ai/samples?v=20170307' \
-H "Authorization: Bearer GLAVEUNCTYGSRIW5XH46XFITF45LP2WH" \
-H "Content-Type: application/json" \
-d '[{
"text": "send me the quizzing protocol",
    "entities": [
    {
        "entity": "intent",
        "value": "protocol"
    },
    {
        "entity": "protocol",
        "value": "exams",
        "start": 12,
        "end":16
    }
]
}]'*/