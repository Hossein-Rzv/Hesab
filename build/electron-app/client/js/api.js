// لایه‌ی ارتباط با سرور

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(method, url, body) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. از روشن بودن برنامه مطمئن شوید.', 0)
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    /* پاسخ غیر JSON */
  }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `خطای ${res.status}`, res.status)
  }
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
}
