// Generated from merchandising.vey. Do not edit directly.
const recentIds = ["2am-the-contour", "2am-the-fieldwork", "2am-the-interval", "2am-the-resolve", "2am-the-stillwater", "2am-the-anchor", "2am-the-steady", "2am-the-weekday", "2am-the-daybreak", "2am-the-crosswalk", "2am-the-afterhours-henley", "2am-the-afterhours", "2am-the-maingate"];
function priority(product) {
  if (product.fulfillment !== "tapstitch") {
    return 1000;
  }
  const index = recentIds.indexOf(product.id);
  return index >= 0 ? index : 100;
}
function featureProducts(products) {
  const teamShirts = ["6acebf0403967ac06707359a", "6acec30e03967ac0670738ca"];
  return products.filter(product => !teamShirts.includes(String(product.id))).sort((a, b) => {
    const group = Number(b.fulfillment === "tapstitch") - Number(a.fulfillment === "tapstitch");
    if (group !== 0) {
      return group;
    }
    const date = (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    if (date !== 0) {
      return date;
    }
    return priority(a) - priority(b);
  });
}
globalThis.MambruMerchandising = { featureProducts };
const commitments = [["Faith before success.", "Mambru Inc. is grounded in Catholic values. Business, money, status, and ambition should never come before God, family, morality, or personal character."], ["Discipline over hype.", "Real progress comes from consistently doing the work, not appearing successful."], ["Integrity over shortcuts.", "We do not knowingly deceive customers, manipulate people, fake scarcity, misrepresent products, or sacrifice ethics for profit."], ["Quality over quantity.", "Products should be worth what customers pay for them. We would rather make fewer good products than flood the market with low-quality ones."], ["Individuality over trends.", "2AMCases should encourage people to build their own identity instead of blindly copying what is popular."], ["Service over exploitation.", "Customers are people, not numbers. We aim to treat them honestly, respectfully, and fairly."], ["Stewardship over waste.", "Mambru Inc. should use money, materials, time, and opportunities responsibly rather than wastefully."], ["Family and community matter.", "Success is not worth destroying relationships or ignoring responsibilities to the people around us."], ["Humility in success.", "Accomplishments should create gratitude and responsibility, not arrogance."], ["Growth with purpose.", "Profit matters because a healthy business needs profit to survive, but profit is a tool — not the ultimate purpose of the company."]];
function addText(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  parent.append(element);
  return element;
}
function renderValues() {
  if (typeof document === "undefined") {
    return;
  }
  const mount = document.getElementById("brandValues");
  if (!mount) {
    return;
  }
  for (const [index, commitment] of commitments.entries()) {
    const card = document.createElement("article");
    card.className = "value-card";
    addText(card, "span", String(index + 1).padStart(2, "0"), "value-number");
    addText(card, "h3", commitment[0], "value-title");
    addText(card, "p", commitment[1], "value-body");
    mount.append(card);
  }
}
renderValues();
