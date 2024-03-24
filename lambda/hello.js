"use strict";

exports.handler = async function(event) {
    console.log("request:", JSON.stringify(event, undefined, 2));
    return {
        statusCode: 200,
        headers: {"Context-Type": "text/plain"},
        body: `Shalom, CDK! You've hit ${event.path} \n`
    };
};