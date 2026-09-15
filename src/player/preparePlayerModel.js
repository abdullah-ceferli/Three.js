export function preparePlayerModel(model) {
  const unwanted=/^(R1|R4(?:\.001)?|Sketchfab_model\.008)$/i;
  [...model.children].forEach(child=>{if(unwanted.test(child.name))model.remove(child);});
  return model;
}
