let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'TechTalkHub');
  if (memoryAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  let payload: unknown = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await res.json();
  }

  if (!res.ok) {
    const errMsg =
      (payload as { error?: string; message?: string } | null)?.error ||
      (payload as { error?: string; message?: string } | null)?.message ||
      'Something went wrong. Please try again.';
    throw new ApiError(errMsg, res.status, payload);
  }

  return payload as T;
}

export async function apiUpload<T = unknown>(
  url: string,
  formData: FormData
): Promise<T> {
  const headers = new Headers();
  headers.set('X-Requested-With', 'TechTalkHub');
  if (memoryAuthToken) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    headers,
    credentials: 'include',
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      payload?.error || 'Upload failed. Please try again.',
      res.status,
      payload
    );
  }
  if (!payload || typeof payload !== 'object') {
    throw new ApiError(
      'Upload response was invalid. Please refresh and try again.',
      res.status || 500,
      payload
    );
  }
  return payload as T;
}
