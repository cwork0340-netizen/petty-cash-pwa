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
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error('Apps Script 回傳非 JSON 資料');
    }

    // 舊版 Apps Script 回傳 { success, data }；新版 API 回傳 { result }。
    // 在代理層統一格式，避免前端因部署版本不同而無法載入。
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'result')) {
      payload = { success: true, data: payload.result };
    }
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.status(gasResponse.ok ? 200 : gasResponse.status).json(payload);
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
