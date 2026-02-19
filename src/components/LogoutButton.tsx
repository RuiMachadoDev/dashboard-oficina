import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function LogoutButton() {
  const nav = useNavigate();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        nav("/login");
      }}
      className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
    >
      Sair
    </button>
  );
}
