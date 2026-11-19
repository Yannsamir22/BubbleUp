import { useState } from "react";
import {
  AtSign, BarChart3, Bot, Disc3, Gamepad2, Hash, Megaphone, Mic, MoreHorizontal, Paperclip, Pin, Plus, Reply, Search, Shield, Smile, SmilePlus, Swords, Trophy, Users, VenetianMask, Timer, PartyPopper,
} from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { Modal } from "../ui/primitives.jsx";

const Row = ({ icon: Icon, title, children }) => (
  <div className="help-row">
    <span className="help-icon">
      <Icon size={18} />
    </span>
    <div>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  </div>
);

const Key = ({ children }) => <kbd className="kbd">{children}</kbd>;

const SECTIONS = {
  basics: {
    label: "The basics",
    body: () => (
      <>
        <p className="help-lead">
          BubbleUp is your class's group chat. Everything happens inside a <b>class</b>; each class has <b>channels</b> for different
          topics, and you can also send <b>private messages</b>.
        </p>
        <Row icon={Plus} title="Classes (the icons on the far left)">
          Your teacher creates a class and gives you a 6-letter code. Click <b>+</b> and enter it to join. You can be in several classes
          and switch between them on the left.
        </Row>
        <Row icon={Hash} title="Channels (#general, #homework…)">
          Everyone in the class can read and write in channels. Keep each conversation in the right one, e.g. homework questions in
          #homework.
        </Row>
        <Row icon={Megaphone} title="Announcements">
          Only teachers can write in channels with the megaphone icon. Check them for important news.
        </Row>
        <Row icon={Users} title="Private messages">
          Under “Direct messages” in the sidebar, or from someone's name in the People list. Only the two of you can read them.
        </Row>
      </>
    ),
  },
  messages: {
    label: "Messages",
    body: () => (
      <>
        <Row icon={Reply} title="Send">
          Type in the box at the bottom and press <Key>Enter</Key>. For a new line use <Key>Shift</Key> + <Key>Enter</Key>.
        </Row>
        <Row icon={SmilePlus} title="React, reply and more">
          Point at a message (tap it on a phone) to show its buttons: an emoji reaction, <b>Reply</b>, and <MoreHorizontal size={14} /> for
          edit, copy, pin or delete.
        </Row>
        <Row icon={AtSign} title="Mention someone">
          Type <b>@</b> and pick a name. They get a notification and the message is highlighted for them.
        </Row>
        <Row icon={Pin} title="Pinned messages">
          Teachers pin important messages. Open them with the pin button at the top of the channel.
        </Row>
        <Row icon={Search} title="Search">
          The search button at the top finds old messages in the whole class or just the current channel.
        </Row>
        <p className="help-note">
          Formatting: <code>**bold**</code> → <b>bold</b>, <code>*italic*</code> → <i>italic</i>, <code>`code`</code>. Press <Key>↑</Key>{" "}
          in an empty message box to edit your last message.
        </p>
      </>
    ),
  },
  files: {
    label: "Files & polls",
    body: () => (
      <>
        <Row icon={Paperclip} title="Files and photos">
          Click the paperclip, drag files onto the chat, or paste a screenshot. Up to 10 files at once. Click an image to see it full size.
        </Row>
        <Row icon={Mic} title="Voice notes">
          Click the microphone (it appears when the message box is empty), talk, then press the square to stop. Press send to share it.
        </Row>
        <Row icon={BarChart3} title="Polls">
          Click the chart button next to the message box. Choose one or several answers, and optionally make votes anonymous. You see the
          results after voting.
        </Row>
      </>
    ),
  },
  bot: {
    label: "Thinkmas bot",
    body: ({ staff }) => (
      <>
        <p className="help-lead">
          Thinkmas is a small helper bot. Type <b>/</b> in the message box to see its commands, or mention <b>@thinkmas</b> with a question.
        </p>
        <table className="help-table">
          <tbody>
            {[
              ["/calc 3 * (4 + 5)", "Calculator (also units: 5 cm to inch)"],
              ["/define photosynthesis", "English dictionary"],
              ["/poll Question | A | B", "Quick poll"],
              ["/ask when is the test?", "Ask a question the class bot was taught"],
              ["/roll 2d6 · /flip", "Dice and coin"],
              ["/help", "List every command (only you see the answer)"],
              ...(staff ? [["/learn question :: answer", "Teach Thinkmas an answer (teachers only)"]] : []),
            ].map(([cmd, what]) => (
              <tr key={cmd}>
                <td>
                  <code>{cmd}</code>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  fun: {
    label: "Fun & games",
    body: () => (
      <>
        <p className="help-lead">
          Everything here is in the <Gamepad2 size={14} /> <b>Games</b> button next to the message box.
        </p>
        <Row icon={Swords} title="Chess">
          Choose a classmate to challenge. A game card appears in the chat; when they accept, click it to open the board. Click a piece,
          then the square to move to (or drag it). Everyone can watch, only the two players can move. You can also challenge someone from
          their name in the People list.
        </Row>
        <Row icon={VenetianMask} title="Imposter">
          A group game for 3 to 10 players. Everyone gets the same secret word except one player, the imposter, who only knows the
          category. Take turns giving short clues (two rounds), then vote for who you think the imposter is. If they are caught, they can
          still win by guessing the word. Start one from the Games button or with <code>/imposter</code> (or <code>/imposter food</code>).
          Classmates who aren't playing can watch live, but they never see the word until the end.
        </Row>
        <Row icon={Timer} title="Countdowns">
          Type <code>/countdown Chemistry exam 2026-12-10</code> (you can add a time, e.g. <code>09:00</code>) to post a live countdown:
          “12 days until Chemistry exam 😬”. A teacher's countdown is pinned to the channel automatically, and unpins itself the day after.
        </Row>
        <Row icon={PartyPopper} title="Message effects">
          Messages like “congrats”, “well done”, “happy birthday” or “test cancelled” set off confetti or balloons for everyone in the
          channel (once per message). Turn them off in Profile &amp; settings.
        </Row>
        <Row icon={Disc3} title="Random picker">
          Spins a wheel for everyone to see. Leave it empty to pick a random student, or give options, e.g. <code>/pick pizza, pasta, rice</code>.
        </Row>
        <Row icon={Smile} title="Class emoji">
          Upload your own emoji (a photo, a drawing, an inside joke). Use them with <code>:name:</code>, from the emoji button's
          “Class” tab, or as reactions.
        </Row>
        <Row icon={Trophy} title="Weekly awards">
          Every Friday afternoon Thinkmas posts awards in #general: Chatterbox, Most helpful in #homework, Crowd favourite, Emoji
          champion, Question master, Night owl… Type <code>/awards</code> to see this week's standings.
        </Row>
      </>
    ),
  },
  teachers: {
    label: "For teachers",
    staffOnly: true,
    body: () => (
      <>
        <Row icon={Users} title="Inviting people">
          Class menu (top of the sidebar) → <b>Invite people</b>. The <b>student code</b> is for students; the <b>teacher code</b> gives
          moderation rights, so only share it with colleagues. If a code leaks, reset it in Class settings.
        </Row>
        <Row icon={Shield} title="Moderation">
          Delete any message from its <MoreHorizontal size={14} /> menu. In the People list, use a student's menu to mute them (10 minutes
          to 24 hours) or remove them from the class.
        </Row>
        <Row icon={Hash} title="Channels">
          Create channels with the <b>+</b> next to “Channels”. Choose “Teachers only” to make an announcement channel.
        </Row>
        <Row icon={Bot} title="Teach the bot">
          <code>/learn when is the exam? :: Monday 9am, room 12</code>. Students can then ask <code>@thinkmas when is the exam</code>.
        </Row>
      </>
    ),
  },
};

export function HelpModal({ onClose }) {
  const staff = useStore((s) => {
    const d = s.details[s.activeClassId];
    return d ? isStaffRole(d.myRole) : false;
  });
  const [tab, setTab] = useState("basics");
  const tabs = Object.entries(SECTIONS).filter(([, v]) => !v.staffOnly || staff);
  const Body = SECTIONS[tab].body;
  return (
    <Modal title="How BubbleUp works" onClose={onClose} wide>
      <div className="help">
        <nav className="help-tabs" aria-label="Help topics">
          {tabs.map(([key, v]) => (
            <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)} aria-current={tab === key}>
              {v.label}
            </button>
          ))}
        </nav>
        <div className="help-body">
          <Body staff={staff} />
        </div>
      </div>
    </Modal>
  );
}
