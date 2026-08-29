exports.handler = async function () {

    const apiKey = process.env.API_KEY;

    const calendarId = "c56f0345c8a935d9d4c595146ab880a8a72983c0196a5b35428c292f3e74eb9b@group.calendar.google.com";

    // timeMin: só traz eventos a partir de agora — sem isso, a API devolve
    // o histórico inteiro do calendário (inclusive de anos atrás).
    // singleEvents=true: expande eventos recorrentes ("toda live de
    // quinta") em instâncias individuais, cada uma com sua própria data.
    // Sem isso, um evento recorrente vem como UM item só com uma regra de
    // recorrência (RRULE) que o FullCalendar no front-end não interpreta
    // — só a primeira ocorrência apareceria no calendário do site.
    // orderBy=startTime exige singleEvents=true e garante ordem cronológica.
    const params = new URLSearchParams({
        key: apiKey,
        timeMin: new Date().toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
    });

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;

    try {

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.items)) {
            // Antes falhava em silêncio total — sem log nenhum, impossível
            // diagnosticar em produção se a chave expirou, a cota da API
            // estourou, ou o Google mudou algo no formato da resposta.
            console.error("Google Calendar API respondeu com erro:", response.status, JSON.stringify(data));
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

        console.error("Falha ao buscar Google Calendar:", error.message);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: [] })
        };

    }

};