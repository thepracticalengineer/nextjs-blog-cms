import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { assertDedicatedTestProject } from '../environment'

test('public article reactions persist through real actions, reload and guest reads', async ({ page, browser, seedPostIds }) => {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!
 assertDedicatedTestProject(url,process.env.E2E_SUPABASE_PROJECT_REF)
 const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data:post,error}=await db.from('posts').select('id,slug,author_id').in('id',seedPostIds).eq('status','published').single()
 expect(error).toBeNull()
 const comment=randomUUID()
 const addedContent=`New reaction comment ${randomUUID()}`
 const inserted=await db.from('comments').insert({id:comment,post_id:post!.id,author_id:post!.author_id,content:`Reaction verification ${comment}`})
 expect(inserted.error).toBeNull()
 try{
  await page.goto('/login')
  await page.getByLabel('Email address',{exact:true}).fill(process.env.E2E_TEST_EMAIL??'e2e-test@playwright.local')
  await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_TEST_PASSWORD??'E2eTestPassword123!')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  const article=`/blog/${post!.slug}`
  // Hold a browser aggregate request open: the write must not wait behind it
  // in Next's action queue, and its late stale snapshot must not undo the save.
  let heldRead: import('@playwright/test').Route | undefined
  await page.route('**/rest/v1/rpc/get_comment_reactions', route => { heldRead=route })
  await page.goto(article)
  await expect.poll(()=>heldRead!==undefined).toBe(true)
  const card=page.getByText(`Reaction verification ${comment}`,{exact:true}).locator('..')
  await card.getByRole('button',{name:'Like: 0 reactions'}).click()
  await expect(card.getByRole('button',{name:'Like: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  await heldRead!.fulfill({json:[{comment_id:comment,counts:{like:0,love:0,celebrate:0,insightful:0},selection:null}]})
  await page.unroute('**/rest/v1/rpc/get_comment_reactions')
  await card.screenshot({path:'test-results/comment-reactions-public.png'})
  await page.reload()
  await expect(card.getByRole('button',{name:'Like: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  await card.getByRole('button',{name:'Love: 0 reactions'}).click()
  await expect(card.getByRole('button',{name:'Like: 0 reactions'})).toHaveAttribute('aria-pressed','false')
  const guest=await browser.newContext()
  try{
   const guestPage=await guest.newPage()
   await guestPage.goto(new URL(article,page.url()).href)
   const guestCard=guestPage.getByText(`Reaction verification ${comment}`,{exact:true}).locator('..')
   await expect(guestCard.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','false')
   await guestCard.getByRole('button',{name:'Love: 1 reaction'}).click()
   const signIn=guestCard.getByRole('link',{name:'Sign in to react'})
   await expect(signIn).toHaveAttribute('href',`/login?next=${encodeURIComponent(`${article}#comments`)}`)
   await signIn.click()
   await guestPage.getByLabel('Email address',{exact:true}).fill(process.env.E2E_TEST_EMAIL??'e2e-test@playwright.local')
   await guestPage.getByLabel('Password',{exact:true}).fill(process.env.E2E_TEST_PASSWORD??'E2eTestPassword123!')
   await guestPage.getByRole('button',{name:'Sign in',exact:true}).click()
   await expect(guestPage).toHaveURL(new URL(`${article}#comments`,page.url()).href)
  }finally{await guest.close()}
  await card.getByRole('button',{name:'Love: 1 reaction'}).click()
  await expect(card.getByRole('button',{name:'Love: 0 reactions'})).toHaveAttribute('aria-pressed','false')
  // Posting revalidates the RSC tree without replacing the mounted provider.
  // The new comment must have controls immediately, before focus/polling.
  await page.getByRole('textbox',{name:'Comment content'}).fill(addedContent)
  await page.getByRole('button',{name:'Post Comment',exact:true}).click()
  const added=page.getByText(addedContent,{exact:true}).locator('..')
  await expect(added.getByRole('button',{name:'Insightful: 0 reactions'})).toBeEnabled()
  await added.getByRole('button',{name:'Insightful: 0 reactions'}).click()
  await expect(added.getByRole('button',{name:'Insightful: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  const persisted=await db.from('comment_reactions').select('comment_id').eq('comment_id',comment)
  expect(persisted.error).toBeNull(); expect(persisted.data).toEqual([])
 }finally{
  await db.from('comments').delete().eq('post_id',post!.id).eq('content',addedContent)
  const cleanup=await db.from('comments').delete().eq('id',comment)
  expect(cleanup.error).toBeNull()
 }
})
