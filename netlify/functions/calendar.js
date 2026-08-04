exports.handler = async function () {

    const apiKey = process.env.API_KEY;

    const calendarId = process.env.CAlEN_ID;

    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?key=${apiKey}`;

    try {

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.items)) {
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: [] })
            };
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        };

    } catch (error) {

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: [] })
        };

    }

};
