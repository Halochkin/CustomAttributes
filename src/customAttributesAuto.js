function throwAsyncError(err) {
  const event = new Event("error", err);
  event.defaultAction = _ => console.error(err);
  window.dispatchEvent(event);
}

const customAttributesImpl = {};
let notUpgradedAttr = [];         //todo make into an array of WeakRef
window.customAttributes = {};
Object.defineProperty(window.customAttributes, "define", {
  value: function (key, constructor) {
    if (customAttributesImpl[key])
      throw new Error(key + " already defined");
    customAttributesImpl[key] = constructor.prototype;        //todo remove the .prototype here.
    const notUpgraded = notUpgradedAttr.slice();
    notUpgradedAttr = [];
    for (let at of notUpgraded)
      upgradeClass(at)
  }
});

function upgradeClass(at) {
  if (at.constructor !== Attr)
    return;
  const definition = customAttributesImpl[at.name] ??= defineCompoundAttribute(at.name)?.prototype;
  if (!definition)
    return notUpgradedAttr.push(at);
  try {
    Object.setPrototypeOf(at, definition);
    at.upgrade?.();
    at.onChange?.();
  } catch (err) {
    throwAsyncError(err);
  }
}

function defineCompoundAttribute(name) {
  const compound = name.match(/(:?)([^-]+)-(.+)/);
  if (!compound)
    return;
  const [_, sync, atName, eventName] = compound;
  const def = customAttributesImpl[atName];
  if (def) {
    const CustomAttr = def.constructor;
    return class CompoundAttribute extends CustomAttr {
      upgrade() {
        super.upgrade?.();
        //todo make the this._listener stored in a WeakMap. and should we make the e.defaultAction in a method on this element?
        this._listener = !!sync ?
          e => this.onEvent(e) :
          e => e.defaultAction = _ => this.onEvent(e);
        this.ownerElement.addEventListener(eventName, this._listener);
      }

      remove() {
        this.ownerElement.removeEventListener(eventName, this._listener);
        super.remove?.();
      }
    };
  }
  //else
  // todo with unknown definition, we can turn it simply into a call on the method
  //  with the same name on the element? be turned into method calls on the element??
}

ElementObserver.end(el => {
  for (let at of el.attributes)
    upgradeClass(at);
});

function deprecate(name) {
  return function deprecated() {
    throw `${name}() is deprecated`;
  }
}

// Monkeypatch Attr. only setAttribute, getAttribute and removeAttribute (and in template) works.
// The .attributes gives a fallback method to access the Attr objects from JS.
(function (getAttrOG, setAttrOG, removeAttrOG, getAttrNodeOG) {
  Element.prototype.hasAttributeNS = deprecate("Element.hasgetAttributeNS");
  Element.prototype.getAttributeNS = deprecate("Element.getAttributeNS");
  Element.prototype.setAttributeNS = deprecate("Element.setAttributeNS");
  Element.prototype.removeAttributeNS = deprecate("Element.removeAttributeNS");
  Element.prototype.getAttributeNode = deprecate("Element.getAttributeNode");
  Element.prototype.setAttributeNode = deprecate("Element.setAttributeNode");
  Element.prototype.removeAttributeNode = deprecate("Element.removeAttributeNode");
  Element.prototype.getAttributeNodeNS = deprecate("Element.getAttributeNodeNS");
  Element.prototype.setAttributeNodeNS = deprecate("Element.setAttributeNodeNS");
  Element.prototype.removeAttributeNodeNS = deprecate("Element.removeAttributeNodeNS");
  document.createAttribute = deprecate("document.createAttribute");

  Element.prototype.setAttribute = function (name, value) {
    if (this.hasAttribute(name)) {
      const at = getAttrNodeOG.call(this, name);
      const oldValue = getAttrOG.call(this, name);
      setAttrOG.call(this, name, value);
      at.onChange?.(oldValue);
    } else {
      setAttrOG.call(this, name, value);
      const at = getAttrNodeOG.call(this, name);
      upgradeClass(at);
    }
  };
  Element.prototype.removeAttribute = function (name) {
    getAttrNodeOG.call(this, name)?.remove?.();
    removeAttrOG.call(this, name);
  };
})(Element.prototype.getAttribute, Element.prototype.setAttribute, Element.prototype.removeAttribute, Element.prototype.getAttributeNode);