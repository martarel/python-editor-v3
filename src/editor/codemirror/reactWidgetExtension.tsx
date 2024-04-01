import { Button, HStack, Text } from "@chakra-ui/react";
import { EditorState, Extension, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language"
import { useState, useCallback } from "react";
import { PortalFactory } from "./CodeMirror";

let openWidgetLoc = -1;
const OpenReactComponent = ({ loc, view }: { loc: number, view: EditorView }) => {
  const handleClick = useCallback(() => {
    openWidgetLoc = loc;
    // TODO: not sure how to force a view update without a list of changes
    view.dispatch({
      changes: {
        from: 0,
        to: 1,
        insert: view.state.doc.sliceString(0, 1),
      }
    });
  }, []);
  return (
    <HStack fontFamily="body" spacing={5} py={3}>
      <Button onClick={handleClick}>Open</Button>
    </HStack>
  );
};

const ToggleReactComponent = ({ from, to, view }: { from: number, to: number, view: EditorView }) => {
  let curVal = view.state.doc.sliceString(from, to);
  const handleClick = useCallback(() => {
    let opposite = curVal === "True" ? "False" : "True";
    view.dispatch({
      changes: {
        from: from,
        to: to,
        insert: opposite,
      }
    });
  }, [curVal, from, to, view]);
  return (
    <HStack fontFamily="body" spacing={5} py={3}>
      <Button onClick={handleClick}>Toggle</Button>
      <Text fontWeight="semibold">Value: {curVal}</Text>
    </HStack>
  );
};

/**
 * This widget will have its contents rendered by the code in CodeMirror.tsx
 * which it communicates with via the portal factory.
 */
class ToggleWidget extends WidgetType {
  private portalCleanup: (() => void) | undefined;

  constructor(private from: number, private to: number, private createPortal: PortalFactory) {
    super();
  }

  toDOM(view: EditorView) {
    const dom = document.createElement("div");

    console.log(openWidgetLoc);
    if(this.to != openWidgetLoc) this.portalCleanup = this.createPortal(dom, <OpenReactComponent loc={this.to} view={view} />);
    else this.portalCleanup = this.createPortal(dom, <ToggleReactComponent from={this.from} to={this.to} view={view} />);
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

// Iterates through the syntax tree, finding occurences of SoundEffect ArgList, and places toy widget there
export const reactWidgetExtension = (
  createPortal: PortalFactory
): Extension => {
  const decorate = (state: EditorState) => {
    let widgets: any[] = []
    function createWidget(from: number, to: number) {
      let deco = Decoration.widget({
        widget: new ToggleWidget(from, to, createPortal),
        side: 1,
        block: true,
      });
    
      widgets.push(deco.range(to));
    }

    let from = 0
    let to = state.doc.length-1 // TODO: could optimize this to just be lines within view
    syntaxTree(state).iterate({
      from, to,
      enter: (ref) => {
        if(ref.name === "Boolean"){
          createWidget(ref.from, ref.to);
        }
      }
    })

    return Decoration.set(widgets)
  };

  const stateField = StateField.define<DecorationSet>({
    create(state) {
      return decorate(state);
    },
    update(widgets, transaction) {
      if (transaction.docChanged) {
        // update openWidgetLoc if changes moves it
        transaction.changes.iterChangedRanges((_fromA, _toA, _fromB, _toB) => {
          if(_toA <= openWidgetLoc){
            openWidgetLoc += (_toB - _fromB) - (_toA - _fromA)
          }
        });
        return decorate(transaction.state);
      }
      return widgets.map(transaction.changes);
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });

  // Stores location of open widget or -1 if all are closed
  // const openWidgetState = StateField.define<number>({
  //   create() {
  //     return -1;
  //   },
  //   update(loc, transaction) {
  //     if (transaction.docChanged) {
  //       return loc;
  //     }
  //     return loc;
  //   },
  // })
  return [stateField];
}
