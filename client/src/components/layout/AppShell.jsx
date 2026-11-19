import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useStore } from "../../store/index.js";
import { chatPath, navigate } from "../../lib/router.js";
import { storage } from "../../lib/browser.js";
import { ClassRail } from "./ClassRail.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { ChannelHeader } from "./ChannelHeader.jsx";
import { RightPanel } from "../panels/RightPanel.jsx";
import { ChatView } from "../chat/ChatView.jsx";
import { ModalHost } from "../modals/ModalHost.jsx";
import { EffectsLayer } from "../effects/EffectsLayer.jsx";
import { Spinner } from "../ui/primitives.jsx";
import "../../styles/layout.css";
import "../../styles/chat.css";
import "../../styles/fun.css";

export default function AppShell({ classId, channelId }) {
  const detail = useStore((s) => s.details[classId]);
  const panel = useStore((s) => s.panel);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const connection = useStore((s) => s.connection);
  const hasDetail = !!detail;

  // Load the class (also validates membership).
  useEffect(() => {
    if (hasDetail) return;
    useStore
      .getState()
      .loadClass(classId)
      .catch((err) => {
        useStore.getState().toast(err.message, "error");
        storage.set("lastClass", null);
        navigate("/", { replace: true });
      });
  }, [classId, hasDetail]);

  // Pick a channel when the URL has none (or a stale one).
  useEffect(() => {
    if (!detail) return;
    if (channelId && detail.channels[channelId]) return;
    const channels = Object.values(detail.channels);
    const last = storage.get(`lastChannel:${classId}`, null);
    const target = detail.channels[last] ?? channels.find((c) => c.name === "general") ?? channels[0];
    if (target) navigate(chatPath(classId, target.id), { replace: true });
  }, [detail, classId, channelId]);

  useEffect(() => {
    useStore.getState().setActive(classId, channelId);
    storage.set("lastClass", classId);
    if (channelId) storage.set(`lastChannel:${classId}`, channelId);
  }, [classId, channelId]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => e.key === "Escape" && useStore.getState().setSidebar(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const channel = detail && channelId ? detail.channels[channelId] : null;

  return (
    <div className={`shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <nav className="nav" aria-label="Classes and channels">
        <ClassRail activeClassId={classId} />
        {detail ? <Sidebar detail={detail} activeChannelId={channelId} /> : <div className="sidebar" />}
      </nav>
      <div className="nav-scrim" onClick={() => useStore.getState().setSidebar(false)} />

      <main className="main">
        {channel ? (
          <>
            <ChannelHeader channel={channel} detail={detail} />
            <ChatView key={channel.id} channel={channel} detail={detail} />
          </>
        ) : (
          <div className="boot">
            <Spinner size={28} />
          </div>
        )}
      </main>

      {panel && channel && <RightPanel panel={panel} channel={channel} detail={detail} />}
      <ModalHost />
      <EffectsLayer />
      {connection !== "connected" && (
        <div className="connection-banner" role="status">
          {connection === "offline" ? <WifiOff size={14} /> : <Spinner size={12} />}
          {connection === "offline" ? "You're offline — retrying…" : "Reconnecting…"}
        </div>
      )}
    </div>
  );
}
