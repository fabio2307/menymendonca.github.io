exports.handler = async function () {

    const apiKey = process.env.API_KEY;

    const calendarId = "c56f0345c8a935d9d4c595146ab880a8a72983c0196a5b35428c292f3e74eb9b@group.calendar.google.com";

    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?key=${apiKey}`;

    try {

        const response = await fetch(url);
        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {

        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Erro ao buscar eventos" })
        };

    }

};
