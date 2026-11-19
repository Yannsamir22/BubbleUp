import { LogOut } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Avatar, Button, Logo } from "../ui/primitives.jsx";
import { CreateClassForm, JoinClassForm } from "./ClassForms.jsx";
import "../../styles/auth.css";

/** Shown when the person isn't in any class yet. */
export function Welcome() {
  const me = useStore((s) => s.me);
  const logout = useStore((s) => s.logout);
  return (
    <div className="welcome">
      <header className="welcome-top">
        <Logo size={28} withText />
        <span className="welcome-user">
          <Avatar user={me} size={28} />
          {me.displayName}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut size={16} /> Log out
          </Button>
        </span>
      </header>

      <div className="welcome-inner">
        <header>
          <h1>Welcome, {me.displayName}.</h1>
          <p>You're not in a class yet. Choose what describes you:</p>
        </header>
        <div className="welcome-cards">
          <section className="welcome-card">
            <span className="welcome-tag">Students</span>
            <h2>Join a class</h2>
            <p>Type the 6-letter code your teacher gave you (on the board, by message or on paper). Not sure what it is? Ask your teacher.</p>
            <JoinClassForm />
          </section>
          <section className="welcome-card">
            <span className="welcome-tag">Teachers</span>
            <h2>Create a class</h2>
            <p>You'll get a code to share with your students. We set up #general, #announcements, #homework and #random for you. You can change them later.</p>
            <CreateClassForm />
          </section>
        </div>
      </div>
    </div>
  );
}
