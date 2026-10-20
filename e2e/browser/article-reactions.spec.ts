import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { assertDedicatedTestProject } from '../environment'

test('article selections persist through real actions, browser reads, reload and guest modal', async ({page,browser,seedPostIds})=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!
 assertDedicatedTestProject(url,process.env.E2E_SUPABASE_PROJECT_REF)
 const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data:post,error}=await db.from('posts').select('id,slug,author_id').in('id',seedPostIds).eq('status','published').single()
 expect(error).toBeNull()
 const article=`/blog/${post!.slug}`
 const region=page.getByRole('region',{name:'Article reactions',exact:true})
 try{
  await page.goto('/login')
  await page.getByLabel('Email address',{exact:true}).fill(process.env.E2E_TEST_EMAIL??'e2e-test@playwright.local')
  await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_TEST_PASSWORD??'E2eTestPassword123!')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto(article)
  await expect(region.getByText('0 reactions',{exact:true})).toBeVisible()
  await region.getByRole('button',{name:'Add reaction'}).click()
  await page.getByRole('button',{name:'Love: 0 reactions'}).click()
  await expect(page.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'Fire: 0 reactions'}).click()
  await expect(region.getByText('2 reactions',{exact:true})).toBeVisible()
  await page.reload()
  await region.getByRole('button',{name:'Add reaction'}).click()
  await expect(page.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('button',{name:'Fire: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  const guest=await browser.newContext()
  try{
   const guestPage=await guest.newPage()
   await guestPage.goto(new URL(article,page.url()).href)
   await expect(guestPage.getByRole('region',{name:'Article reactions',exact:true}).getByText('2 reactions',{exact:true})).toBeVisible()
   await guestPage.getByRole('button',{name:'Add reaction'}).click()
   const trigger=guestPage.getByRole('button',{name:'Love: 1 reaction'})
   await expect(trigger).toHaveAttribute('aria-pressed','false')
   await trigger.click()
   const dialog=guestPage.getByRole('dialog',{name:'Log in to continue'})
   await expect(dialog).toBeVisible()
   await expect(dialog.getByRole('link',{name:'Log in',exact:true})).toHaveAttribute('href',`/login?next=${encodeURIComponent(`${article}#article-reactions`)}`)
   await expect(dialog.getByRole('link',{name:'Create account'})).toHaveAttribute('href',`/register?next=${encodeURIComponent(`${article}#article-reactions`)}`)
   await dialog.getByRole('button',{name:'Close',exact:true}).click()
   await expect(trigger).toBeFocused()
   const {data:rows,error:readError}=await db.from('article_reactions').select('reaction').eq('post_id',post!.id)
   expect(readError).toBeNull();expect(rows).toHaveLength(2)
  }finally{await guest.close()}
  await page.getByRole('button',{name:'Love: 1 reaction'}).click()
  await expect(page.getByRole('button',{name:'Love: 0 reactions'})).toHaveAttribute('aria-pressed','false')
  await expect(page.getByRole('button',{name:'Fire: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'Fire: 1 reaction'}).click()
  await expect(region.getByText('0 reactions',{exact:true})).toBeVisible()
 }finally{
  const cleanup=await db.from('article_reactions').delete().eq('post_id',post!.id).eq('user_id',post!.author_id)
  expect(cleanup.error).toBeNull()
 }
})
