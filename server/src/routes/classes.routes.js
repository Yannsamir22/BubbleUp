import { Router } from "express";
import { badRequest } from "../lib/errors.js";

const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("Invalid id.");
  return n;
};

export function classRoutes({ services, rt }) {
  const { classes, channels, messages, uploads, emojis, calendar } = services;
  const r = Router();

  function detail(classId, userId) {
    const membership = classes.requireMember(classId, userId);
    const cls = classes.getClass(classId);
    return {
      class: classes.classDto(cls, membership.role),
      myRole: membership.role,
      channels: channels.listForUser(classId, userId),
      members: classes.members(classId).map((m) => ({ ...m, online: rt.isOnline(m.id) })),
      emojis: emojis.list(classId),
    };
  }

  function announceMember(classId, userId) {
    const member = classes.member(classId, userId);
    if (member) rt.toClass(classId, "member:updated", { classId, member: { ...member, online: rt.isOnline(userId) } });
  }

  function postSystem(classId, body) {
    const general = channels.general(classId);
    if (!general) return;
    const msgId = messages.createBotMessage(general.id, body, { kind: "system" });
    rt.toClass(classId, "message:new", { message: messages.get(msgId, 0) });
  }

  r.get("/classes", (req, res) => {
    res.json({ classes: classes.listForUser(req.user.id) });
  });

  r.post("/classes", (req, res) => {
    const classId = classes.create(req.user.id, req.body ?? {});
    rt.joinClass(req.user.id, classId);
    res.status(201).json(detail(classId, req.user.id));
  });

  r.post("/classes/join", (req, res) => {
    const result = classes.join(req.user.id, req.body ?? {});
    if (!result.alreadyMember) {
      rt.joinClass(req.user.id, result.classId);
      announceMember(result.classId, req.user.id);
      const name = req.user.display_name;
      postSystem(result.classId, `**${name}** joined the class${result.role === "teacher" ? " as a teacher" : ""}.`);
    } else if (result.promoted) {
      announceMember(result.classId, req.user.id);
    }
    res.json({ ...detail(result.classId, req.user.id), joined: !result.alreadyMember, promoted: !!result.promoted });
  });

  r.get("/classes/:classId", (req, res) => {
    res.json(detail(id(req.params.classId), req.user.id));
  });

  r.get("/classes/:classId/events", (req, res) => {
    const classId = id(req.params.classId);
    res.json({ events: calendar.list(classId, req.user.id) });
  });

  r.post("/classes/:classId/events", (req, res) => {
    const classId = id(req.params.classId);
    calendar.create(classId, req.user.id, req.body ?? {});
    const events = calendar.list(classId, req.user.id);
    rt.toClass(classId, "calendar:updated", { classId, events });
    res.status(201).json({ events });
  });

  r.delete("/classes/:classId/events/:eventId", (req, res) => {
    const classId = id(req.params.classId);
    calendar.remove(classId, id(req.params.eventId), req.user.id);
    const events = calendar.list(classId, req.user.id);
    rt.toClass(classId, "calendar:updated", { classId, events });
    res.json({ events });
  });

  r.patch("/classes/:classId", (req, res) => {
    const classId = id(req.params.classId);
    const cls = classes.update(classId, req.user.id, req.body ?? {});
    rt.toClass(classId, "class:updated", { class: classes.classDto(cls, "student") });
    res.json({ class: classes.classDto(cls, "owner") });
  });

  r.delete("/classes/:classId", (req, res) => {
    const classId = id(req.params.classId);
    const memberIds = classes.memberIds(classId);
    uploads.purgeClass(classId, () => classes.remove(classId, req.user.id));
    rt.toClass(classId, "class:removed", { classId, reason: "deleted" });
    memberIds.forEach((uid) => rt.leaveClass(uid, classId));
    res.status(204).end();
  });

  r.post("/classes/:classId/codes", (req, res) => {
    const classId = id(req.params.classId);
    const cls = classes.regenerateCodes(classId, req.user.id);
    res.json({ class: classes.classDto(cls, "owner") });
  });

  r.post("/classes/:classId/leave", (req, res) => {
    const classId = id(req.params.classId);
    classes.leave(classId, req.user.id);
    rt.leaveClass(req.user.id, classId);
    rt.toClass(classId, "member:removed", { classId, userId: req.user.id });
    res.status(204).end();
  });

  r.patch("/classes/:classId/members/:userId", (req, res) => {
    const classId = id(req.params.classId);
    const target = id(req.params.userId);
    classes.setRole(classId, req.user.id, target, req.body ?? {});
    announceMember(classId, target);
    announceMember(classId, req.user.id);
    if (req.body?.role === "owner") {
      rt.toClass(classId, "class:updated", { class: classes.classDto(classes.getClass(classId), "student") });
    }
    // Role changes affect which invite codes someone may see: tell them to refetch.
    rt.toUser(target, "class:refresh", { classId });
    rt.toUser(req.user.id, "class:refresh", { classId });
    res.json({ member: classes.member(classId, target) });
  });

  r.post("/classes/:classId/members/:userId/mute", (req, res) => {
    const classId = id(req.params.classId);
    const target = id(req.params.userId);
    classes.mute(classId, req.user.id, target, req.body ?? {});
    announceMember(classId, target);
    res.json({ member: classes.member(classId, target) });
  });

  r.delete("/classes/:classId/members/:userId", (req, res) => {
    const classId = id(req.params.classId);
    const target = id(req.params.userId);
    classes.kick(classId, req.user.id, target);
    rt.toUser(target, "class:removed", { classId, reason: "kicked" });
    rt.leaveClass(target, classId);
    rt.toClass(classId, "member:removed", { classId, userId: target });
    res.status(204).end();
  });

  r.post("/classes/:classId/channels", (req, res) => {
    const classId = id(req.params.classId);
    const channel = channels.create(classId, req.user.id, req.body ?? {});
    const dto = channels.dto({ ...channel, last_read_id: 0, last_message_id: 0, unread: 0, mentions: 0 });
    rt.toClass(classId, "channel:created", { channel: dto });
    res.status(201).json({ channel: dto });
  });

  r.post("/classes/:classId/dms", (req, res) => {
    const classId = id(req.params.classId);
    const otherId = id(req.body?.userId);
    const { channel, created } = channels.openDm(classId, req.user.id, otherId);
    const mine = channels.listForUser(classId, req.user.id).find((c) => c.id === channel.id);
    if (created) {
      const theirs = channels.listForUser(classId, otherId).find((c) => c.id === channel.id);
      rt.toUser(otherId, "channel:created", { channel: theirs });
      rt.toUser(req.user.id, "channel:created", { channel: mine });
    }
    res.status(created ? 201 : 200).json({ channel: mine });
  });

  r.get("/classes/:classId/search", (req, res) => {
    const classId = id(req.params.classId);
    const channelId = req.query.channelId ? id(req.query.channelId) : undefined;
    res.json({ messages: messages.search(classId, req.user.id, req.query.q, { channelId }) });
  });

  r.post(
    "/classes/:classId/uploads",
    (req, res, next) => {
      classes.requireMember(id(req.params.classId), req.user.id);
      next();
    },
    uploads.middleware,
    (req, res) => {
      try {
        const attachment = uploads.record(id(req.params.classId), req.user.id, req.file, req.body ?? {});
        res.status(201).json({ attachment });
      } catch (err) {
        uploads.discard(req.file);
        throw err;
      }
    },
  );

  return r;
}
