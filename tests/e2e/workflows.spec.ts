import { test, expect } from "../../apps/web/node_modules/@playwright/test";
test("document upload and source-grounded question",async({page})=>{
  await page.goto("/knowledge");
  await page.locator('input[type="file"]').setInputFiles({name:"e2e-manual.txt",mimeType:"text/plain",buffer:Buffer.from("The fictional OMEGA-2 press requires inspection every 19 days. Record all findings.")});
  await expect(page.getByText("e2e-manual.txt").first()).toBeVisible();
  await page.getByRole("textbox",{name:"Question"}).fill("What is the OMEGA-2 inspection interval?");
  await page.getByRole("button",{name:"Send question"}).click();
  await expect(page.getByText(/every 19 days/).first()).toBeVisible();
  await expect(page.locator(".sources details").first()).toBeVisible();
});
test("synthetic demand forecast and inventory simulation",async({page})=>{
  await page.goto("/production");
  await page.getByRole("button",{name:"Generate synthetic data"}).click();
  await expect(page.getByText("Synthetic data",{exact:true}).first()).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Run forecast"}).click();
  await expect(page.getByText("Mean absolute error")).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Simulate inventory policy"}).click();
  await expect(page.getByText("Simulation only",{exact:true})).toBeVisible();
});
test("vision displays checkpoint requirement without fake prediction",async({page})=>{
  await page.goto("/vision");
  await expect(page.getByText("No trained inspection model available")).toBeVisible();
  await expect(page.getByRole("button",{name:"Run inspection"})).toBeDisabled();
});
test("navigation and responsive shell",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("button",{name:"Toggle navigation"}).click();
  await page.getByRole("link",{name:"Data Pipelines",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Data Pipelines",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
