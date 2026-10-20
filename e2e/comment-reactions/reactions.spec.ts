import { test, expect } from '@playwright/test'
const id='15900000-0000-4000-8000-000000000020'
const path='/e2e/comment-reactions/fixture.html'
test.beforeEach(async ({page})=>{
 const selections:Record<string,string|null>={}
 let lost=false
 await page.route('**/__reactions?*',async route=>{
  const request=route.request()
  const viewer=new URL(request.url()).searchParams.get('viewer')!
  if(request.method()==='POST') {
   selections[viewer]=request.postDataJSON().desired
   if(new URL(request.url()).searchParams.has('lose')&&!lost){
    lost=true
    await route.fulfill({status:503,json:{error:'Response lost after commit'}})
    return
   }
  }
  const counts={like:0,love:0,celebrate:0,insightful:0}
  for(const value of Object.values(selections)) if(value) counts[value as keyof typeof counts]++
  const snapshot={counts,selection:selections[viewer]??null}
  await route.fulfill({json:request.method()==='POST'?{data:snapshot}:{data:{[id]:snapshot},viewerId:viewer==='guest'?null:viewer}})
 })
})
test('add, replace, remove and reload keep counts and pressed states',async({page})=>{
 await page.goto(path)
 const like=()=>page.getByRole('button',{name:/^Like:/})
 await expect(like()).toHaveAttribute('aria-pressed','false')
 await like().click()
 await expect(like()).toHaveAccessibleName('Like: 1 reaction')
 await expect(like()).toHaveAttribute('aria-pressed','true')
 await page.reload()
 await expect(like()).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'Love: 0 reactions'}).click()
 await expect(like()).toHaveAccessibleName('Like: 0 reactions')
 const love=page.getByRole('button',{name:'Love: 1 reaction'})
 await expect(love).toHaveAttribute('aria-pressed','true')
 await love.click()
 await expect(page.getByRole('button',{name:'Love: 0 reactions'})).toHaveAttribute('aria-pressed','false')
})
test('guest guidance, touch targets and narrow layout',async({page})=>{
 await page.setViewportSize({width:320,height:640})
 await page.goto(`${path}?viewer=guest`)
 const button=page.getByRole('button',{name:'Insightful: 0 reactions'})
 await button.click()
 await expect(page.getByRole('link',{name:'Sign in to react'})).toBeVisible()
 await expect(button).toHaveAttribute('aria-pressed','false')
 for(const control of await page.getByRole('group',{name:'Comment reactions'}).getByRole('button').all()){
  const box=(await control.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('keyboard activation and screen-reader confirmation',async({page})=>{
 await page.goto(path)
 const like=page.getByRole('button',{name:'Like: 0 reactions'})
 await like.focus(); await page.keyboard.press('Enter')
 await expect(page.getByRole('button',{name:'Like: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('status').filter({hasText:'Like reaction saved.'})).toHaveText('Like reaction saved.')
})
test('lost response reconciles saved state; retry does not toggle it off',async({page})=>{
 await page.goto(`${path}?viewer=reader&lose=1`)
 await page.getByRole('button',{name:'Like: 0 reactions'}).click()
 await expect(page.getByRole('button',{name:'Like: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'Retry reaction'}).click()
 await expect(page.getByRole('button',{name:'Like: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('alert')).toHaveCount(0)
})
