const fetch = require("node-fetch");

exports.handler = async (event) => {
    const url = event.queryStringParameters.url;

    try {
        const res = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
        );

        const data = await res.json();

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(data),
        };

    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};