import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isCurrentUserAdmin } from "../lib/admin";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    const ok = await isCurrentUserAdmin();
    setLoading(false);

    if (!ok) {
      await supabase.auth.signOut();
      setErrorMsg("Esta conta não tem permissões de admin.");
      return;
    }

    nav("/");
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <div className="w-full rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">Entrar</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Acesso reservado (admin).
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                className="mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@exemplo.com"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Password</label>
              <Input
                className="mt-1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {errorMsg ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorMsg}
              </div>
            ) : null}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "A entrar..." : "Entrar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
