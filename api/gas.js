const GAS_URL = 'https://script.google.com/macros/s/AKfycbyek_Rbq4ipKjjcGrWQMwOxZDIwWMC9aAqzwI4kSUrpCxvyDl6PHzTyA9T8c4NerS66mQ/exec';

export default async function handler(request, response) {
  try {
    const incomingUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
    const gasUrl = new URL(GAS_URL);

    incomingUrl.searchParams.forEach((value, key) => {
      gasUrl.searchParams.set(key, value);
    });

    const gasResponse = await fetch(gasUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
    });

    const text = await gasResponse.text();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).send(text);
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
