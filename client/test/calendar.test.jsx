import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../src/lib/api.js";
import { useStore } from "../src/store/index.js";
import { CalendarModal } from "../src/components/calendar/CalendarModal.jsx";

vi.mock("../src/lib/api.js", () => ({ api: { get: vi.fn(), post: vi.fn(), del: vi.fn() } }));

beforeEach(() => {
  useStore.setState({
    me: { id: 1, displayName: "Ada" },
    calendarEvents: {},
    toasts: [],
  });
  api.get.mockResolvedValue({ events: [] });
  api.post.mockReset();
  api.del.mockReset();
});

describe("<CalendarModal>", () => {
  it("loads and displays upcoming events for class members", async () => {
    api.get.mockResolvedValue({
      events: [{ id: 10, title: "Physics test", description: "Chapters 1–3", startsAt: Date.parse("2030-01-02T10:00:00Z"), createdBy: { id: 2, displayName: "Teacher" } }],
    });
    render(<CalendarModal classId={5} className="Physics" role="student" onClose={() => {}} />);

    expect(await screen.findByText("Physics test")).toBeInTheDocument();
    expect(screen.getByText("Chapters 1–3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to calendar" })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/classes/5/events");
  });

  it("lets teachers add an event with the chosen local date and time", async () => {
    api.post.mockResolvedValue({ events: [] });
    render(<CalendarModal classId={5} className="Physics" role="teacher" onClose={() => {}} />);
    const startsAt = screen.getByLabelText("Date and time");
    await userEvent.clear(screen.getByLabelText("Event title"));
    await userEvent.type(screen.getByLabelText("Event title"), "Lab report due");
    await userEvent.clear(startsAt);
    await userEvent.type(startsAt, "2030-01-02T10:30");
    await userEvent.click(screen.getByRole("button", { name: "Add to calendar" }));

    expect(api.post).toHaveBeenCalledWith("/classes/5/events", {
      title: "Lab report due",
      description: "",
      startsAt: new Date("2030-01-02T10:30").getTime(),
    });
  });
});
