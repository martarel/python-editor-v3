import { Button, HStack, Text } from "@chakra-ui/react";
import { EditorState, Extension, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language"
import { useState, useCallback } from "react";
import { PortalFactory } from "./CodeMirror";

/**
 * An example react component that we use inside a CodeMirror widget as
 * a proof of concept.
 */
function ToggleReactComponent(bval: boolean): React.ReactNode {
  const [counter, setCounter] = useState(0);
  // Define a callback function that increments the counter by one.
  const handleClick = useCallback(() => {
    setCounter(counter + 1);
    //console.log(counter)
  }, [counter]);
  return (
    <HStack fontFamily="body" spacing={5} py={3}>
      <Button onClick={handleClick}>Increment</Button>
      <Text fontWeight="semibold">Counter: {counter}</Text>
    </HStack>
  );
};

/**
 * This widget will have its contents rendered by the code in CodeMirror.tsx
 * which it communicates with via the portal factory.
 */
class ToggleWidget extends WidgetType {
  private portalCleanup: (() => void) | undefined;

  constructor(private bval: boolean, private createPortal: PortalFactory) {
    super();
  }

  toDOM() {
    console.log(this.bval);
    const dom = document.createElement("div");
    this.portalCleanup = this.createPortal(dom, ToggleReactComponent(this.bval));
    return dom;
  }

  destroy(dom: HTMLElement): void {
    if (this.portalCleanup) {
      this.portalCleanup();
    }
  }

  ignoreEvent() {
    return true;
  }
}

function createWidget(bool: string, from: number, to: number, createPortal: PortalFactory): Decoration {
  let bval = bool === "True"

  let deco = Decoration.widget({
    widget: new ToggleWidget(bval, createPortal),
    side: 1,
  });

  return deco;
}

// Iterates through the syntax tree, finding occurences of SoundEffect ArgList, and places toy widget there
export const reactWidgetExtension = (
  createPortal: PortalFactory
): Extension => {
  const decorate = (state: EditorState) => {
    let widgets: any[] = []
    let from = 0
    let to = state.doc.length-1 // TODO: could optimize this to just be lines within view
    //let t = state.doc.toString()
    //console.log(t);

    syntaxTree(state).iterate({
      from, to,
      enter: (node: any) => { // TODO: type is SyntaxNode
        //console.log(node.name)
        //console.log(state.doc.sliceString(node.from, node.to))

        if(node.name === "Boolean") {
          widgets.push(createWidget(state.doc.sliceString(node.from, node.to), node.from, node.to, createPortal).range(node.to));
        }
      }
    })

    return Decoration.set(widgets)
    
    // const endOfFirstLine = state.doc.lineAt(0).to;
    // const widget = Decoration.widget({
    //   block: true,
    //   widget: new ExampleReactBlockWidget(createPortal),
    //   side: 1,
    // });
    // return Decoration.set(widget.range(endOfFirstLine));
  };

  const stateField = StateField.define<DecorationSet>({
    create(state) {
      return decorate(state);
    },
    update(widgets, transaction) {
      if (transaction.docChanged) {
        return decorate(transaction.state);
      }
      return widgets.map(transaction.changes);
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
  return [stateField];
};