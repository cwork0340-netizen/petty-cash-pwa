const GAS_URL = 'https://script.google.com/macros/s/AKfycbyek_Rbq4ipKjjcGrWQMwOxZDIwWMC9aAqzwI4kSUrpCxvyDl6PHzTyA9T8c4NerS66mQ/exec';

exports.handler = async function(event) {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const url = `${GAS_URL}?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    const text = await response.text();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: text
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
