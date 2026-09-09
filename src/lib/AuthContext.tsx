import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Profile, Role } from "../types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (args: {
    email: string; password: string; fullName: string; companyName: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setProfile(null);
      setRole(null);
      return;
    }
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .maybeSingle();
    setProfile(profileData as Profile | null);

    if (profileData) {
      const { data: roleData } = await supabase
        .from("roles")
        .select("*")
        .eq("id", (profileData as Profile).role_id)
        .maybeSingle();
      setRole(roleData as Role | null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile().finally(() => setLoading(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function hasPermission(perm: string): boolean {
    if (!role) return false;
    return role.permissions.includes("*") || role.permissions.includes(perm);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp({ email, password, fullName, companyName }: {
    email: string; password: string; fullName: string; companyName: string;
  }) {
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) return { error: signUpError.message };

    // The auth.signUp call above creates the auth.users row and (if
    // email confirmation is off in your Supabase project) an active
    // session. This RPC then provisions the tenant, seeds default
    // roles, and creates this user's profile as the tenant owner.
    const { error: rpcError } = await supabase.rpc("create_tenant_and_owner", {
      company_name: companyName,
      full_name: fullName,
    });
    if (rpcError) return { error: rpcError.message };

    await loadProfile();
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, role, loading, hasPermission, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
