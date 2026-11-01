import prisma from './src/config/prisma.js';

async function main() {
  const articles = await prisma.help_articles.findMany();
  for (const art of articles) {
    // Clean up raw markdown stars (**word**) and normalize headings
    const cleaned = art.content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1');

    await prisma.help_articles.update({
      where: { id: art.id },
      data: { content: cleaned },
    });
    console.log(`Cleaned article: ${art.title}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

