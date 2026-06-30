import { supabase } from "../supabase";

export async function getAdminAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");
  return session.access_token;
}

export async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : "API request failed");
  }

  return response.json() as Promise<T>;
}
