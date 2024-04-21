import { render } from "@testing-library/react";
import React from "react";
import { MicrobitSinglePixelComponent } from "./setPixelWidget";
import { EditorView } from "@codemirror/view"; 

describe("MicrobitSinglePixelComponent", () => {
  it("renders without crashing", () => {
    const onCloseClick = jest.fn();
    const { getByText } = render(
      <MicrobitSinglePixelComponent
        props={{ args: [], ranges: [], types: [], from: 0, to: 0 }}
        view={new EditorView()}
      />
    );
    expect(getByText("X")).toBeInTheDocument();
  });
});
