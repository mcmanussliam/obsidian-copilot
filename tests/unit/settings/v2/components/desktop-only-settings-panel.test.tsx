import { DesktopOnlySettingsPanel } from "@/settings/v2/components/desktop-only-settings-panel";
import { render, screen } from "@testing-library/react";
import React from "react";

describe("DesktopOnlySettingsPanel", () => {
  describe("DesktopOnlySettingsPanel()", () => {
    it("renders the caller's explanation so each gated panel names its own feature", () => {
      render(<DesktopOnlySettingsPanel message="Skills are available on desktop." />);
      expect(screen.getByText("Skills are available on desktop.")).not.toBeNull();
    });
  });
});
