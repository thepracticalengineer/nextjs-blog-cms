import { test, expect } from '@playwright/test'
const path='/e2e/article-reactions/fixture.html'
test.beforeEach(async({page})=>{
 const selections:Record<string,Set<string>>={}
 let lost=false
 await page.route('**/__article_reactions?*',async route=>{
  const request=route.request(), params=new URL(request.url()).searchParams
  const viewer=params.get('viewer')!
  if(request.method()==='POST'){
   const {reaction,selected}=request.postDataJSON()
   selections[viewer]??=new Set()
   if(selected) selections[viewer].add(reaction); else selections[viewer].delete(reaction)
   if(params.has('lose')&&!lost){lost=true;await route.fulfill({status:503,json:{error:'Lost after commit'}});return}
  }
  const counts:Record<string,number>={love:0,unicorn:0,mind_blown:0,celebrate:0,fire:0}
  for(const types of Object.values(selections))for(const type of types)counts[type]++
  const data={counts,selections:[...(selections[viewer]??[])]}
  await route.fulfill({json:request.method()==='POST'?{data}:{data,viewerId:viewer==='guest'?null:viewer}})
 })
})
async function open(page:import('@playwright/test').Page){await page.getByRole('button',{name:'Add reaction'}).click()}
test('independent types, removal, aggregate and persistence across reload',async({page})=>{
 await page.goto(path);await open(page)
 await page.getByRole('button',{name:'Love: 0 reactions'}).click()
 await expect(page.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'Fire: 0 reactions'}).click()
 await expect(page.getByText('2 reactions',{exact:true})).toBeVisible()
 await page.reload();await open(page)
 await expect(page.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('button',{name:'Fire: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'Love: 1 reaction'}).click()
 await expect(page.getByRole('button',{name:'Love: 0 reactions'})).toHaveAttribute('aria-pressed','false')
 await expect(page.getByRole('button',{name:'Fire: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByText('1 reaction',{exact:true})).toBeVisible()
 await page.screenshot({path:`test-results/article-reactions/${test.info().project.name}-picker.png`})
})
test('guest modal traps focus and restores the selected trigger on Escape and close',async({page})=>{
 let writes=0
 page.on('request',request=>{if(request.url().includes('/__article_reactions')&&request.method()==='POST')writes++})
 await page.goto(`${path}?viewer=guest`);await open(page)
 const trigger=page.getByRole('button',{name:'Unicorn: 0 reactions'})
 await trigger.click()
 const modal=page.getByRole('dialog',{name:'Log in to continue'})
 await expect(modal).toBeVisible()
 await expect(modal.getByRole('link',{name:'Log in',exact:true})).toHaveAttribute('href','/login?next=%2Fblog%2Fexample%23article-reactions')
 await expect(modal.getByRole('link',{name:'Create account'})).toHaveAttribute('href','/register?next=%2Fblog%2Fexample%23article-reactions')
 await modal.getByRole('link',{name:'Log in',exact:true}).focus()
 await page.keyboard.press('Shift+Tab')
 await expect(modal.getByRole('button',{name:'Close',exact:true})).toBeFocused()
 await page.keyboard.press('Tab')
 await expect(modal.getByRole('link',{name:'Log in',exact:true})).toBeFocused()
 await page.screenshot({path:`test-results/article-reactions/${test.info().project.name}-login.png`})
 await page.keyboard.press('Escape');await expect(modal).toBeHidden();await expect(trigger).toBeFocused()
 await trigger.click();await modal.getByRole('button',{name:'Close',exact:true}).click()
 await expect(modal).toBeHidden();await expect(trigger).toBeFocused()
 expect(writes).toBe(0)
 await expect(page.getByText('0 reactions',{exact:true})).toBeVisible()
 await expect(page).toHaveURL(new RegExp('fixture.html\\?viewer=guest$'))
})
test('keyboard selection, picker Escape and touch targets at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:640})
 await page.goto(path)
 const add=page.getByRole('button',{name:'Add reaction'})
 await add.focus();await page.keyboard.press('Enter')
 const love=page.getByRole('button',{name:'Love: 0 reactions'})
 await expect(love).toBeFocused()
 await page.keyboard.press('ArrowRight')
 await expect(page.getByRole('button',{name:'Unicorn: 0 reactions'})).toBeFocused()
 await page.keyboard.press('Space')
 await expect(page.getByRole('button',{name:'Unicorn: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 for(const control of await page.getByRole('group',{name:'Choose article reactions'}).getByRole('button').all()){
  const box=(await control.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44)
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.keyboard.press('Escape');await expect(add).toBeFocused()
})
test('lost response reconciles and retries without toggling off',async({page})=>{
 await page.goto(`${path}?viewer=reader&lose=1`);await open(page)
 await page.getByRole('button',{name:'Love: 0 reactions'}).click()
 await expect(page.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 const picker=page.getByRole('dialog',{name:'How did this article land?'})
 await expect(picker.getByRole('button',{name:'Retry reaction'})).toBeVisible()
 // Recovery stays available after dismissal and when the picker is reopened.
 await page.keyboard.press('Escape')
 await expect(page.getByRole('region',{name:'Article reactions'}).getByRole('button',{name:'Retry reaction'})).toBeVisible()
 await open(page)
 await picker.getByRole('button',{name:'Retry reaction'}).click()
 await expect(page.getByRole('alert')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','true')
})
