import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * Patch DOM methods so Google Translate's <font>-wrapping
 * doesn't crash React's reconciler during navigation.
 */
if (typeof Node !== "undefined") {
  const origRemoveChild = Node.prototype.removeChild;
  
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      // Google Translate moved this node; skip the removal silently
      return child;
    }
    // eslint-disable-next-line prefer-rest-params
    return origRemoveChild.apply(this, arguments as any) as T;
  };

  const origInsertBefore = Node.prototype.insertBefore;
  
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== this) {
      // Reference node was reparented by Google Translate; append instead
      return origInsertBefore.call(this, newNode, null) as T;
    }
    // eslint-disable-next-line prefer-rest-params
    return origInsertBefore.apply(this, arguments as any) as T;
  };
}

createRoot(document.getElementById("root")!).render(<App />);
