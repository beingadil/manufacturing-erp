import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineEditInput } from "./InlineEditInput";

afterEach(cleanup);

function getInput(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("InlineEditInput", () => {
  it("renders the persisted value", () => {
    render(<InlineEditInput value="Steel" onCommit={() => {}} />);
    expect(getInput().value).toBe("Steel");
  });

  it("commits the draft on blur when it changed", () => {
    const onCommit = vi.fn();
    render(<InlineEditInput value="Steel" onCommit={onCommit} />);
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Steel 2" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Steel 2");
  });

  it("does not commit on blur when the value is unchanged", () => {
    const onCommit = vi.fn();
    render(<InlineEditInput value="Steel" onCommit={onCommit} />);
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits the draft on Enter", () => {
    const onCommit = vi.fn();
    render(<InlineEditInput value="Steel" onCommit={onCommit} />);
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Aluminium" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Aluminium");
  });

  it("reverts the draft on Escape without committing", () => {
    const onCommit = vi.fn();
    render(<InlineEditInput value="Steel" onCommit={onCommit} />);
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Garbage" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("Steel");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("re-syncs to the persisted value when the store value changes externally", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<InlineEditInput value="Steel" onCommit={onCommit} />);
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "WIP" } });
    // Store updates elsewhere (e.g. another window/session) → parent re-renders
    rerender(<InlineEditInput value="Brass" onCommit={onCommit} />);
    // The store value wins — draft must follow the new value, and blur must not
    // commit the discarded draft.
    fireEvent.blur(input);
    expect(input.value).toBe("Brass");
    expect(onCommit).not.toHaveBeenCalled();
  });
});
