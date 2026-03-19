export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">About</h1>

      <div className="mt-8 space-y-6 text-base leading-7 text-gray-700">
        <p>
          Gluten-Free Finder is a simple project to help people evaluate
          restaurants for gluten-free suitability more quickly.
        </p>

        <p>
          The goal is to make it easier to search for a restaurant and see
          early signals around safety, confidence, and available gluten-free
          options.
        </p>

        <p>
          This project is still evolving, and assessments may improve over time
          as more information is reviewed and added.
        </p>

        <p>
          If you find this useful and want to support the project, you can add a
          support link here later, such as Buy Me a Coffee.
        </p>
      </div>
    </main>
  );
}