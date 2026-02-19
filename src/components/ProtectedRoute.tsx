import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isCurrentUserAdmin } from "../lib/admin";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function run() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!mounted) return;
        setAllowed(false);
        setReady(true);
        return;
      }

      const ok = await isCurrentUserAdmin();
      if (!mounted) return;
      setAllowed(ok);
      setReady(true);
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 text-sm text-zinc-600">
          A validar acesso…
        </div>
      </div>
    );
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
