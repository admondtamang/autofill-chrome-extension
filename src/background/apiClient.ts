import { AUTH_HEADER_NAME, AUTH_HEADER_PREFIX } from "@/shared/config";

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string },
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  if (token !== undefined && token !== "") {
    headers.set(AUTH_HEADER_NAME, `${AUTH_HEADER_PREFIX} ${token}`);
  }

  const response = await fetch(path, { ...fetchOptions, headers });

  if (!response.ok) {
    console.error(`apiFetch error: ${response.status} ${path}`);
    let message: string;
    try {
      const body: unknown = await response.json();
      if (
        body !== null &&
        typeof body === "object" &&
        "message" in body &&
        typeof (body as Record<string, unknown>)["message"] === "string"
      ) {
        message = (body as Record<string, string>)["message"];
      } else {
        message = `Request failed with status ${response.status}`;
      }
    } catch {
      message = `Request failed with status ${response.status}`;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
