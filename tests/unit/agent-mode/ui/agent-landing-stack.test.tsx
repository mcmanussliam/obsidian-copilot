import { AgentLandingStack } from "@/agent-mode/ui/agent-landing-stack";
import { render, screen } from "@testing-library/react";
import React from "react";

describe("AgentLandingStack", () => {
  describe("AgentLandingStack()", () => {
    it("renders supplied regions in reading order with the composer last and without reserving space for absent regions", () => {
      const { container } = render(
        <AgentLandingStack
          composer={<div>Composer</div>}
          context={<div>Context</div>}
          shelf={<div>Shelf</div>}
        />
      );

      expect(screen.getAllByText(/Composer|Context|Shelf/).map((node) => node.textContent)).toEqual(
        ["Context", "Shelf", "Composer"]
      );
      expect(Array.from(container.children).map((node) => node.textContent)).toEqual([
        "Context",
        "Shelf",
        "",
        "Composer",
      ]);
    });
  });
});
