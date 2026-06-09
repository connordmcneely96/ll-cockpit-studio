// Validates Supabase JWT using the service role key.
// Call from Server Components / Route Handlers only.
export type AuthContext = {
  userId: string;
  tenantId: string;
  email: string;
};

export async function validateToken(token: string): Promise<AuthContext | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: serviceRoleKey,
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.id) return null;

  return {
    userId: data.id,
    tenantId: data.app_metadata?.tenant_id || 'default',
    email: data.email || '',
  };
}
